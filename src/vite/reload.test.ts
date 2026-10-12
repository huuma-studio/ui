import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, type ViteDevServer } from "vite";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { remoteEndpoint } from "../platform/server/remote.ts";
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

describe("dev server after changes", () => {
  // A copy of the basic fixture, inside test/fixtures so `@huuma/ui` still
  // resolves to this repo.
  let root: string;
  let server: ViteDevServer;
  let origin: string;
  let hmr: WebSocket;
  const messages: { type: string }[] = [];

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
      plugins: [huuma()],
    });
    await server.listen();
    origin = new URL(server.resolvedUrls!.local[0]).origin;

    // What a browser on the page hears from Vite.
    hmr = new WebSocket(
      `${origin.replace("http", "ws")}/?token=${server.config.webSocketToken}`,
      "vite-hmr",
    );
    hmr.addEventListener("message", ({ data }) => messages.push(JSON.parse(String(data))));
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
      expect((await page("/about")).html).toContain("<h1>About us</h1>");
    });
    expect(messages.map((message) => message.type)).toContain("full-reload");
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
