import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import {
  createServer,
  createServerHotChannel,
  createServerModuleRunner,
  DevEnvironment,
  type Plugin,
  type ViteDevServer,
} from "vite";
import { toRequest, writeResponse } from "@huuma/route/node";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { remoteEndpoint } from "../platform/server/remote.ts";
import { SERVER_READY } from "./adapter.ts";
import { huuma } from "./mod.ts";

const fixtures = fileURLToPath(new URL("../../test/fixtures", import.meta.url));

/** Retries `check` until it passes: the watcher reports changes asynchronously. */
async function eventually(check: () => Promise<void>, timeout = 5_000): Promise<void> {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > end) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// The platform's entry: the app with Vite's client, which tells the dev
// server once it's evaluated, like `@huuma/cloudflare`'s Worker.
const ENTRY = "virtual:test/platform-entry";
const ENTRY_CODE = [
  'import app from "virtual:huuma/server";',
  'import { withDevClient } from "@huuma/ui/vite/runtime";',
  'export default withDevClient(app, "/");',
  `import.meta.hot?.send(${JSON.stringify(SERVER_READY)});`,
].join("\n");

/**
 * A platform's plugin, in this process: like `@cloudflare/vite-plugin`'s
 * in workerd, the ssr environment has no runner Huuma can use, and the
 * plugin runs the platform's entry with a module runner of its own.
 */
function platform(): Plugin {
  return {
    name: "test:platform",
    resolveId: (id) => (id === ENTRY ? `\0${ENTRY}` : undefined),
    load: (id) => (id === `\0${ENTRY}` ? ENTRY_CODE : undefined),
    config: () => ({
      environments: {
        ssr: {
          dev: {
            createEnvironment: (name, config) =>
              new DevEnvironment(name, config, { hot: true, transport: createServerHotChannel() }),
          },
        },
      },
    }),
    configureServer(server) {
      const runner = createServerModuleRunner(server.environments.ssr);
      return () => {
        server.middlewares.use(async (req, res, next) => {
          try {
            const { default: worker } = (await runner.import(ENTRY)) as {
              default: { fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> };
            };
            const request = toRequest(req, new AbortController().signal);
            await writeResponse(await worker.fetch(request, {}, {}), res);
          } catch (error) {
            next(error);
          }
        });
      };
    },
  };
}

describe.each([
  { mode: "Node", adapter: () => undefined, inPlatform: false },
  {
    mode: "a platform's runtime",
    adapter: () => ({ name: "test", dev: "platform" as const, plugins: [platform()] }),
    inPlatform: true,
  },
])("dev server after changes, in $mode", ({ adapter, inPlatform }) => {
  // A copy of the basic fixture, inside test/fixtures so `@huuma/ui` still
  // resolves to this repo.
  let root: string;
  let server: ViteDevServer;
  let origin: string;
  let hmr: WebSocket;
  const messages: { type: string }[] = [];
  // The browser's messages, and when the Worker entry was evaluated.
  const events: string[] = [];

  const page = async (path: string) => {
    const response = await fetch(origin + path);
    return { status: response.status, html: await response.text() };
  };

  beforeAll(async () => {
    root = await mkdtemp(join(fixtures, ".tmp-reload-"));
    await cp(join(fixtures, "basic"), root, { recursive: true });
    server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
      plugins: [huuma({ adapter: adapter() })],
    });
    await server.listen();
    origin = new URL(server.resolvedUrls!.local[0]).origin;

    // What a browser on the page hears from Vite.
    hmr = new WebSocket(
      `${origin.replace("http", "ws")}/?token=${server.config.webSocketToken}`,
      "vite-hmr",
    );
    hmr.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data)) as { type: string };
      messages.push(message);
      events.push(message.type);
    });
    server.environments.ssr.hot.on(SERVER_READY, () => events.push(SERVER_READY));
    await new Promise((resolve) => hmr.addEventListener("open", resolve, { once: true }));
  });
  afterAll(async () => {
    hmr.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  });

  test("an edited page renders its new content and the browser reloads", async () => {
    expect((await page("/about")).html).toContain("<h1>About</h1>");
    messages.length = 0;

    await writeFile(
      join(root, "app/about/page.tsx"),
      "export default function About() {\n  return <h1>About us</h1>;\n}\n",
    );

    await eventually(async () => {
      expect(messages.map((message) => message.type)).toContain("full-reload");
    });
    // Once the browser reloads, the app has the change: no retries.
    expect((await page("/about")).html).toContain("<h1>About us</h1>");
  });

  test.runIf(inPlatform)("the browser reloads once the app was evaluated again", async () => {
    await page("/about");
    events.length = 0;

    await writeFile(
      join(root, "app/about/page.tsx"),
      "export default function About() {\n  return <h1>About the team</h1>;\n}\n",
    );

    await eventually(async () => {
      expect(events).toContain("full-reload");
    });
    // Earlier, the browser's request could reach the app mid-evaluation.
    expect(events.indexOf(SERVER_READY)).toBeGreaterThan(-1);
    expect(events.indexOf(SERVER_READY)).toBeLessThan(events.indexOf("full-reload"));
  });

  test("an edited island updates itself in the browser, without a reload", async () => {
    // The browser loaded the page and its island.
    await page("/");
    await fetch(`${origin}/app/counter.client.tsx`);
    messages.length = 0;

    await writeFile(
      join(root, "app/counter.client.tsx"),
      [
        'import { $signal } from "@huuma/ui/hooks/signal";',
        "",
        "export default function Counter({ start = 0 }: { start?: number }) {",
        "  const count = $signal(start);",
        "  return <button on-click={() => count.set(count.get() + 1)}>Count: {count}</button>;",
        "}",
        "",
      ].join("\n"),
    );

    await eventually(async () => {
      expect((await page("/")).html).toContain("<button>Count: 1</button>");
    });
    await eventually(async () => {
      expect(messages).toContainEqual(
        expect.objectContaining({
          type: "update",
          updates: [expect.objectContaining({ path: "/app/counter.client.tsx" })],
        }),
      );
    });
    expect(messages.map((message) => message.type)).not.toContain("full-reload");
  });

  test("an added page is served, a deleted one isn't", async () => {
    expect((await page("/contact")).status).toStrictEqual(404);

    await mkdir(join(root, "app/contact"));
    await writeFile(
      join(root, "app/contact/page.tsx"),
      "export default function Contact() {\n  return <h1>Contact</h1>;\n}\n",
    );
    await eventually(async () => {
      const contact = await page("/contact");
      expect(contact.status).toStrictEqual(200);
      expect(contact.html).toContain("<main><h1>Contact</h1></main>");
    });

    await rm(join(root, "app/contact"), { recursive: true });
    await eventually(async () => {
      expect((await page("/contact")).status).toStrictEqual(404);
    });
  });

  test("an added remote module is served", async () => {
    const call = async () => {
      const response = await fetch(origin + (await remoteEndpoint("app/greet.remote.ts")), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ remoteFunction: "greet", args: ["Ada"] }),
      });
      return { status: response.status, body: await response.text() };
    };
    expect((await call()).status).toStrictEqual(404);

    await writeFile(
      join(root, "app/greet.remote.ts"),
      "export async function greet(name: string) {\n  return `Hello ${name}`;\n}\n",
    );
    await eventually(async () => {
      expect(await call()).toStrictEqual({ status: 200, body: '"Hello Ada"' });
    });
  });
});
