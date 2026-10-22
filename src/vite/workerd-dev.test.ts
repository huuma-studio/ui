// `vite dev` with @cloudflare/vite-plugin, which runs the app's server code
// in workerd: Huuma leaves it the requests, and the plugin runs
// `virtual:huuma/worker`, named as `main` in wrangler.jsonc.
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright-core";

import { button, findChromium, launchChromium, open } from "../../test/browser.ts";
import { fixtures, freePort } from "../../test/build.ts";
import { remoteEndpoint } from "../platform/server/remote.ts";
import { huuma } from "./mod.ts";

// Starting workerd takes a few seconds.
const STARTUP = 60_000;

const chromium = findChromium();

/**
 * Starts the dev server on a copy of the basic fixture, inside
 * test/fixtures so `@huuma/ui` still resolves to this repo; some tests
 * edit it. The Worker has a KV namespace, local to the dev server.
 */
async function startDev(
  prefix: string,
  base = "/",
): Promise<{ root: string; server: ViteDevServer }> {
  const root = await mkdtemp(join(fixtures, prefix));
  await cp(join(fixtures, "basic"), root, { recursive: true });
  await writeFile(
    join(root, "wrangler.jsonc"),
    JSON.stringify({
      name: "huuma-fixture",
      compatibility_date: "2026-10-01",
      main: "virtual:huuma/worker",
      kv_namespaces: [{ binding: "KV", id: "huuma-fixture" }],
    }),
  );
  const server = await createServer({
    root,
    base,
    configFile: false,
    logLevel: "silent",
    // A fixed port, which a restart keeps.
    server: { host: "127.0.0.1", port: await freePort(), strictPort: true },
    plugins: [huuma(), cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: false })],
  });
  await server.listen();
  return { root, server };
}

describe("vite dev in workerd", () => {
  let root: string;
  let server: ViteDevServer;
  let origin: string;
  let browser: Browser | undefined;

  beforeAll(async () => {
    ({ root, server } = await startDev(".tmp-workerd-dev-"));
    origin = new URL(server.resolvedUrls!.local[0]!).origin;
    if (chromium) browser = await launchChromium(chromium);
  }, STARTUP);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });

  test("renders pages, with Vite's client under the page's nonce", async () => {
    const response = await fetch(`${origin}/`);
    expect(response.status).toStrictEqual(200);
    expect(response.headers.get("x-fixture-middleware")).toStrictEqual("app");
    const html = await response.text();
    expect(html).toContain("<main><h1>Home</h1><!-- start_island_");
    const nonce = /'nonce-([^']+)'/.exec(
      response.headers.get("content-security-policy") ?? "",
    )?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(
      `<script type="module" src="/@vite/client" nonce="${nonce}"></script></head>`,
    );
    expect(response.headers.get("content-security-policy")).toContain("worker-src blob:");

    const missing = await fetch(`${origin}/missing`);
    expect(missing.status).toStrictEqual(404);
    expect(await missing.text()).toContain("<h1>Not found</h1>");
  });

  test("calls remote functions", async () => {
    const endpoint = origin + (await remoteEndpoint("app/sum.remote.ts"));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
    });
    expect(await response.json()).toStrictEqual(3);
    // The CSRF checks work in workerd too.
    expect((await fetch(endpoint, { method: "POST", body: "{}" })).status).toStrictEqual(415);
  });

  test("gives remote functions and pages the request context, with bindings", async () => {
    const endpoint = origin + (await remoteEndpoint("app/context.remote.ts"));
    const call = async (remoteFunction: string, args: unknown[]) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user": "ada" },
        body: JSON.stringify({ remoteFunction, args }),
      });
      return response.status === 204 ? undefined : ((await response.json()) as unknown);
    };
    expect(await call("whoAmI", [])).toStrictEqual("ada");
    // KV from wrangler.jsonc, with no getPlatformProxy(): stored through
    // waitUntil(), after the response.
    expect(await call("remember", ["greeting", "hello"])).toBeUndefined();
    await vi.waitFor(async () => expect(await call("recall", ["greeting"])).toStrictEqual("hello"));

    const page = await (await fetch(`${origin}/context`, { headers: { "x-user": "ada" } })).text();
    expect(page).toContain('<dd id="user">ada</dd>');
    expect(page).toContain('<dd id="greeting">hello</dd>');
  });

  test("serves an edited page once the browser reloads", async () => {
    // What a browser on the page hears from Vite.
    const hmr = new WebSocket(
      `${origin.replace("http", "ws")}/?token=${server.config.webSocketToken}`,
      "vite-hmr",
    );
    const messages: string[] = [];
    hmr.addEventListener("message", ({ data }) => {
      messages.push((JSON.parse(String(data)) as { type: string }).type);
    });
    await new Promise((resolve) => hmr.addEventListener("open", resolve, { once: true }));
    try {
      expect(await (await fetch(`${origin}/about`)).text()).toContain("<h1>About</h1>");
      await writeFile(
        join(root, "app/about/page.tsx"),
        "export default function About() {\n  return <h1>About us</h1>;\n}\n",
      );
      await vi.waitFor(() => expect(messages).toContain("full-reload"), { timeout: 10_000 });
      // The app in workerd was evaluated again before the browser reloads.
      const response = await fetch(`${origin}/about`);
      expect(response.status).toStrictEqual(200);
      expect(await response.text()).toContain("<h1>About us</h1>");
    } finally {
      hmr.close();
    }
  });

  describe.skipIf(chromium === undefined)("in a browser", () => {
    test("hydrates islands, and updates an edited one in place", async () => {
      const { page, errors } = await open(browser!, `${origin}/`);
      await page.click("button");
      await button(page, "2");
      // Gone if the page reloads.
      await page.evaluate(() => Object.assign(window, { loaded: true }));

      const counter = join(root, "app/counter.client.tsx");
      const code = await readFile(counter, "utf8");
      await writeFile(counter, code.replace("{count}</button>", "{count}!</button>"));
      await button(page, "2!");
      expect(await page.evaluate(() => "loaded" in window)).toStrictEqual(true);
      expect(errors).toStrictEqual([]);
      await page.close();
    });

    test("reloads the page after server changes, each time with the change", async () => {
      const { page, errors } = await open(browser!, `${origin}/`);
      const home = join(root, "app/page.tsx");
      const code = await readFile(home, "utf8");
      // A few in a row: the app in workerd is evaluated again each time.
      for (const round of [1, 2, 3]) {
        await writeFile(home, code.replace("<h1>Home</h1>", `<h1>Home ${round}</h1>`));
        await page.getByRole("heading", { name: `Home ${round}` }).waitFor({ timeout: 10_000 });
      }
      expect(errors).toStrictEqual([]);
      await page.close();
    });
  });
});

describe("vite dev in workerd below a base", () => {
  // The Cloudflare plugin passes the URL with the base, which Vite strips
  // for Huuma's own middleware: the Worker entry strips it, as in production.
  let root: string;
  let server: ViteDevServer;
  let origin: string;

  beforeAll(async () => {
    ({ root, server } = await startDev(".tmp-workerd-dev-base-", "/shop/"));
    origin = new URL(server.resolvedUrls!.local[0]!).origin;
  }, STARTUP);
  afterAll(async () => {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });

  test("serves pages, islands and remote functions below the base", async () => {
    const home = await (await fetch(`${origin}/shop/`)).text();
    expect(home).toContain("<h1>Home</h1>");
    expect(home).toContain('src="/shop/@vite/client"');
    expect(home).toContain('from "/shop/app/counter.client.tsx"');
    expect((await fetch(`${origin}/shop/app/counter.client.tsx`)).status).toStrictEqual(200);
    expect((await fetch(`${origin}/about`)).status).toStrictEqual(404);

    const response = await fetch(`${origin}/shop${await remoteEndpoint("app/sum.remote.ts")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
    });
    expect(await response.json()).toStrictEqual(3);
  });
});
