import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { createLogger, createServer, type ViteDevServer } from "vite";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

import { remoteEndpoint } from "../platform/server/remote.ts";
import { huuma } from "./mod.ts";

const fixture = fileURLToPath(new URL("../../test/fixtures/basic", import.meta.url));

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

  test("gives remote functions and pages the request context", async () => {
    const response = await fetch(origin + (await remoteEndpoint("app/context.remote.ts")), {
      method: "POST",
      headers: { "content-type": "application/json", "x-user": "ada" },
      body: JSON.stringify({ remoteFunction: "whoAmI", args: [] }),
    });
    // `auth` from the app's middleware in server.ts.
    expect(await response.json()).toStrictEqual("ada");

    const page = await (
      await fetch(`${origin}/context?q=search`, { headers: { "x-user": "ada" } })
    ).text();
    expect(page).toContain('<dd id="user">ada</dd>');
    // No bindings on Node.
    expect(page).toContain('<dd id="greeting">none</dd>');
    expect(page).toContain('<dd id="query">search</dd>');
  });

  test("answers a request a web Request can't represent with 400", async () => {
    // `TRACE` reaches the app's middleware, but a web Request refuses it.
    // `fetch()` can't send it either, so it goes over a socket.
    const { hostname, port } = new URL(origin);
    const status = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(port), hostname, () => {
        socket.write(`TRACE /about HTTP/1.1\r\nHost: ${hostname}\r\n\r\n`);
      });
      socket.once("data", (data) => {
        resolve(data.toString().split("\r\n")[0]);
        socket.destroy();
      });
      socket.once("error", reject);
    });
    expect(status).toStrictEqual("HTTP/1.1 400 Bad Request");
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

describe("dev server with a base", () => {
  // Vite strips the base before the app sees the request.
  let server: ViteDevServer;
  let origin: string;
  beforeAll(async () => {
    server = await createServer({
      root: fixture,
      base: "/shop/",
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
      plugins: [huuma()],
    });
    await server.listen();
    origin = new URL(server.resolvedUrls!.local[0]).origin;
  });
  afterAll(async () => {
    await server.close();
  });

  test("serves pages and islands below the base", async () => {
    const response = await fetch(`${origin}/shop/about`);
    expect(response.status).toStrictEqual(200);
    expect(await response.text()).toContain("<h1>About</h1>");

    const home = await (await fetch(`${origin}/shop/`)).text();
    expect(home).toContain('from "/shop/app/counter.client.tsx"');
  });

  test("calls remote functions below the base", async () => {
    const stub = await (await fetch(`${origin}/shop/app/sum.remote.ts`)).text();
    const endpoint = `/shop${await remoteEndpoint("app/sum.remote.ts")}`;
    expect(stub).toContain(JSON.stringify(endpoint));

    const response = await fetch(origin + endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
    });
    expect(response.status).toStrictEqual(200);
    expect(await response.json()).toStrictEqual(3);
  });
});
