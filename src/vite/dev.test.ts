import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { createLogger, createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";

import { remoteEndpoint } from "../platform/server/remote.ts";
import { huuma } from "./mod.ts";
import { injectViteClient, withViteClient } from "./dev.ts";

const fixture = fileURLToPath(new URL("../../test/fixtures/basic", import.meta.url));

describe(injectViteClient.name, () => {
  test("adds the client at the end of <head>", () => {
    expect(injectViteClient("<html><head><title>x</title></head><body></body></html>", "/")).toBe(
      '<html><head><title>x</title><script type="module" src="/@vite/client"></script></head><body></body></html>',
    );
  });

  test("uses the base and the page's nonce", () => {
    expect(injectViteClient("<head></head>", "/shop/", "abc")).toBe(
      '<head><script type="module" src="/shop/@vite/client" nonce="abc"></script></head>',
    );
  });

  test("without <head>, after <html>, after the doctype or at the start", () => {
    expect(injectViteClient("<!DOCTYPE html><html><p>x</p></html>", "/")).toBe(
      '<!DOCTYPE html><html><script type="module" src="/@vite/client"></script><p>x</p></html>',
    );
    expect(injectViteClient("<!DOCTYPE html><p>x</p>", "/")).toBe(
      '<!DOCTYPE html><script type="module" src="/@vite/client"></script><p>x</p>',
    );
    expect(injectViteClient("<p>x</p>", "/")).toBe(
      '<script type="module" src="/@vite/client"></script><p>x</p>',
    );
  });
});

describe(withViteClient.name, () => {
  test("leaves HTML responses without a body alone", async () => {
    for (const status of [204, 304]) {
      const response = new Response(null, { status, headers: { "content-type": "text/html" } });
      expect(await withViteClient(response, "/")).toBe(response);
    }
  });

  test("keeps status and headers, but drops a stale Content-Length", async () => {
    const response = await withViteClient(
      new Response("<head></head>", {
        status: 404,
        headers: { "content-type": "text/html", "content-length": "13", "x-app": "1" },
      }),
      "/",
    );
    expect(response.status).toStrictEqual(404);
    expect(response.headers.get("x-app")).toStrictEqual("1");
    expect(response.headers.has("content-length")).toStrictEqual(false);
    expect(await response.text()).toContain("/@vite/client");
  });
});

describe("dev server", () => {
  let server: ViteDevServer;
  let origin: string;
  // Vite's log, kept silent.
  const errors: string[] = [];
  const logger = createLogger("silent");
  logger.error = (message) => {
    errors.push(message);
  };
  beforeAll(async () => {
    server = await createServer({
      root: fixture,
      configFile: false,
      customLogger: logger,
      server: { host: "127.0.0.1", port: 0 },
      plugins: [huuma()],
    });
    await server.listen();
    origin = new URL(server.resolvedUrls!.local[0]).origin;
  });
  afterAll(async () => {
    await server.close();
  });

  test("renders a page with its layout and middleware", async () => {
    const response = await fetch(`${origin}/`);
    const html = await response.text();

    expect(response.status).toStrictEqual(200);
    expect(response.headers.get("x-fixture-middleware")).toStrictEqual("app");
    expect(html).toMatch(/^<!DOCTYPE html><html lang="en"><head><title>Fixture<\/title>/);
    expect(html).toContain("<main><h1>Home</h1><!-- start_island_");
    // With the nonce of the page's Content-Security-Policy, like its own scripts.
    const nonce = /'nonce-([^']+)'/.exec(
      response.headers.get("content-security-policy") ?? "",
    )?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(
      `<script type="module" src="/@vite/client" nonce="${nonce}"></script></head>`,
    );
    expect(html).toContain(`<script type="module" nonce="${nonce}">import { launch }`);
  });

  test("launches the page's islands from paths Vite serves", async () => {
    const html = await (await fetch(`${origin}/`)).text();
    const runtime = /import \{ launch \} from "([^"]+)";/.exec(html)?.[1];
    const island = /import \$I1 from "([^"]+)";/.exec(html)?.[1];

    expect(runtime).toStrictEqual("/@id/__x00__virtual:huuma/runtime");
    expect(island).toStrictEqual("/app/counter.client.tsx");
    expect(html).toContain(
      '{fn: $I1, path: "/app/counter.client.tsx", props: {"start":1}, islandId: "',
    );

    const runtimeModule = await fetch(origin + runtime);
    expect(runtimeModule.headers.get("content-type")).toContain("javascript");
    expect(await runtimeModule.text()).toContain("export { hotReplaceIsland, launch }");

    const islandModule = await fetch(origin + island);
    expect(islandModule.headers.get("content-type")).toContain("javascript");
    // Compiled by Oxc with Huuma's dev JSX runtime.
    expect(await islandModule.text()).toContain("jsx-runtime/dev.ts");
  });

  test("logs an error of a body that fails while streaming", async () => {
    // The response started, so the client gets a truncated one.
    await expect(
      fetch(`${origin}/stream-error`).then((response) => response.text()),
    ).rejects.toThrow();
    // Logged once the server sees the failure, just after the client does.
    await vi.waitFor(() => {
      expect(
        errors.some((error) => error.includes("/stream-error: Error: stream failed")),
      ).toStrictEqual(true);
    });
  });

  test("exposes PUBLIC_* env vars from .env, and only those", async () => {
    expect(server.config.env.PUBLIC_GREETING).toStrictEqual("Hello");
    expect(server.config.env.SECRET_TOKEN).toStrictEqual(undefined);

    // Rendered on the server…
    const html = await (await fetch(`${origin}/`)).text();
    expect(html).toMatch(/<p>Hello.*Ada<\/p>/);
    // …and readable in the browser, without the other variables.
    const island = await (await fetch(`${origin}/components/greeting.client.tsx`)).text();
    expect(island).toContain('"PUBLIC_GREETING": "Hello"');
    expect(island).not.toContain("SECRET_TOKEN");
  });

  test("serves remote functions", async () => {
    const response = await fetch(origin + (await remoteEndpoint("app/sum.remote.ts")), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
    });
    expect(response.status).toStrictEqual(200);
    expect(await response.json()).toStrictEqual(3);
  });

  test("serves other pages and the 404 page", async () => {
    const about = await fetch(`${origin}/about`);
    expect(about.status).toStrictEqual(200);
    expect(await about.text()).toContain("<main><h1>About</h1></main>");

    const missing = await fetch(`${origin}/missing`);
    expect(missing.status).toStrictEqual(404);
    expect(await missing.text()).toContain("<h1>Not found</h1>");
  });
});

test("names a missing server entry", async () => {
  const server = await createServer({
    root: fixture,
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
    plugins: [huuma({ server: "missing.ts" })],
  });
  try {
    await server.listen();
    const response = await fetch(server.resolvedUrls!.local[0]);
    expect(response.status).toStrictEqual(500);
    // Vite's error page, with the message as JSON for its error overlay.
    expect(await response.text()).toContain(
      'The server entry \\"' + fixture + "/missing.ts\\\" doesn't exist.",
    );
  } finally {
    await server.close();
  }
});
