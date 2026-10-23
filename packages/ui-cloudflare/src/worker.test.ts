import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, type RunnableDevEnvironment, type ViteDevServer } from "vite";
import { huuma } from "@huuma/ui/vite";
import { fileURLToPath } from "node:url";

import { WORKER_ID, workerModule, workerPlugin } from "./worker.ts";

const fixture = fileURLToPath(new URL("../../../test/fixtures/basic", import.meta.url));

interface Worker {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
}

describe("the Worker entry in dev", () => {
  // Without @cloudflare/vite-plugin: Vite's own module runner imports the
  // entry, as the plugin's does in workerd.
  let server: ViteDevServer;
  let worker: Worker;
  beforeAll(async () => {
    server = await createServer({
      root: fixture,
      base: "/shop/",
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma({ adapter: { name: "test", plugins: [workerPlugin()] } })],
    });
    const ssr = server.environments.ssr as RunnableDevEnvironment;
    ({ default: worker } = (await ssr.runner.import(WORKER_ID)) as { default: Worker });
  });
  afterAll(async () => {
    await server.close();
  });

  test("serves the app below the base, from the full URL a platform passes", async () => {
    const response = await worker.fetch(new Request("http://localhost/shop/about"), {}, {});
    expect(response.status).toStrictEqual(200);
    const html = await response.text();
    expect(html).toContain("<h1>About</h1>");
    // With Vite's client, which Huuma's Node middleware adds otherwise.
    expect(html).toMatch(
      /<script type="module" src="\/shop\/@vite\/client" nonce="[^"]+"><\/script>/,
    );
  });
});

describe(workerModule.name, () => {
  test("is the app as a Worker in the build", () => {
    const code = workerModule("/shop/");
    expect(code).toContain('export default worker(app, "/shop/");');
    expect(code).not.toContain("withDevClient");
    expect(code).not.toContain("import.meta.hot");
  });

  test("adds Vite's client and tells the dev server once it's evaluated, in dev", () => {
    const code = workerModule("/shop/", "/shop/");
    expect(code).toContain('export default worker(withDevClient(app, "/shop/"), "/shop/");');
    expect(code).toContain('import.meta.hot?.send("huuma:server-ready");');
  });
});
