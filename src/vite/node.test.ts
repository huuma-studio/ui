import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { clientFiles, start } from "./node.ts";

describe(clientFiles.name, () => {
  let client: string;
  let files: (request: Request) => Promise<Response | undefined>;
  const get = (path: string, method = "GET") =>
    files(new Request(`http://localhost${path}`, { method }));

  beforeAll(async () => {
    client = await mkdtemp(join(tmpdir(), "huuma-client-"));
    await mkdir(join(client, "assets"));
    await mkdir(join(client, ".vite"));
    await mkdir(join(client, "images"));
    await writeFile(join(client, "assets/app-3f2a.js"), "export {};");
    await writeFile(join(client, "assets/app-9c1d.css"), "a{}");
    await writeFile(join(client, "assets/50%off a.css"), "a{}");
    // From Vite's public dir, with its name as it is.
    await writeFile(join(client, "assets/logo.svg"), "<svg/>");
    await writeFile(join(client, "robots.txt"), "User-agent: *");
    await writeFile(join(client, ".vite/manifest.json"), "{}");
    await writeFile(join(client, ".env"), "SECRET=1");
    files = clientFiles({ client, hashed: ["assets/app-3f2a.js", "assets/app-9c1d.css"] });
  });
  afterAll(async () => {
    await rm(client, { recursive: true, force: true });
  });

  test("serves files with hashed names, cached for good", async () => {
    const response = await get("/assets/app-3f2a.js");
    expect(response?.status).toStrictEqual(200);
    expect(response?.headers.get("content-type")).toStrictEqual("text/javascript");
    expect(response?.headers.get("cache-control")).toStrictEqual(
      "public, max-age=31536000, immutable",
    );
    expect(await response?.text()).toStrictEqual("export {};");
    const css = await get("/assets/app-9c1d.css");
    expect(css?.headers.get("cache-control")).toStrictEqual("public, max-age=31536000, immutable");
  });

  test("serves other files, e.g. from Vite's public dir, cached briefly", async () => {
    for (const path of ["/robots.txt", "/assets/logo.svg"]) {
      const response = await get(path);
      expect(response?.status, path).toStrictEqual(200);
      expect(response?.headers.get("cache-control"), path).toStrictEqual("public, max-age=3600");
    }
  });

  test("decodes paths", async () => {
    const response = await get("/assets/50%25off%20a.css");
    expect(response?.headers.get("content-type")).toStrictEqual("text/css");
    expect(await response?.text()).toStrictEqual("a{}");
  });

  test("answers HEAD without a body", async () => {
    const response = await get("/assets/app-3f2a.js", "HEAD");
    expect(response?.status).toStrictEqual(200);
    expect(response?.headers.get("content-length")).toStrictEqual("10");
    expect(response?.body).toStrictEqual(null);
  });

  test("leaves everything else to the app", async () => {
    for (const path of [
      "/",
      "/assets",
      "/assets/",
      "/images",
      "/missing.js",
      "/.vite/manifest.json",
      "/.env",
      "/assets/../.env",
      "/assets/%2e%2e/.env",
      "/..%2f..%2fetc%2fpasswd",
      "/assets%5capp-3f2a.js",
      "/assets//app-3f2a.js",
      "/%E0%A4%A",
    ]) {
      expect(await get(path), path).toStrictEqual(undefined);
    }
    expect(await get("/assets/app-3f2a.js", "POST")).toStrictEqual(undefined);
  });

  test("serves below the base only", async () => {
    const below = clientFiles({ client: pathToFileURL(`${client}/`), base: "/shop/" });
    const response = await below(new Request("http://localhost/shop/assets/app-3f2a.js"));
    expect(response?.status).toStrictEqual(200);
    expect(await below(new Request("http://localhost/assets/app-3f2a.js"))).toStrictEqual(
      undefined,
    );
  });
});

describe(start.name, () => {
  let client: string;
  beforeAll(async () => {
    client = await mkdtemp(join(tmpdir(), "huuma-start-"));
    await mkdir(join(client, "assets"));
    await writeFile(join(client, "assets/app-3f2a.js"), "export {};");
  });
  afterAll(async () => {
    await rm(client, { recursive: true, force: true });
  });

  test("serves the client files and the app below the base, on Node", async () => {
    const controller = new AbortController();
    const server = await start(
      {
        async fetch(request) {
          const { pathname } = new URL(request.url);
          return new Response(`${request.method} ${pathname} ${await request.text()}`);
        },
      },
      { client, base: "/shop/", port: 0, hostname: "127.0.0.1", signal: controller.signal },
    );
    const origin = `http://127.0.0.1:${server.port}`;
    try {
      const file = await fetch(`${origin}/shop/assets/app-3f2a.js`);
      expect(await file.text()).toStrictEqual("export {};");

      const page = await fetch(`${origin}/shop/about`, { method: "POST", body: "hi" });
      expect(await page.text()).toStrictEqual("POST /about hi");

      const outside = await fetch(`${origin}/about`);
      expect(outside.status).toStrictEqual(404);
    } finally {
      controller.abort();
      await server.finished;
    }
  });
});
