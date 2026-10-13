import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { clientFiles } from "./node.ts";

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
    await writeFile(join(client, "assets/50%off a.css"), "a{}");
    await writeFile(join(client, "robots.txt"), "User-agent: *");
    await writeFile(join(client, ".vite/manifest.json"), "{}");
    await writeFile(join(client, ".env"), "SECRET=1");
    files = clientFiles({ client });
  });
  afterAll(async () => {
    await rm(client, { recursive: true, force: true });
  });

  test("serves built assets, cached for good", async () => {
    const response = await get("/assets/app-3f2a.js");
    expect(response?.status).toStrictEqual(200);
    expect(response?.headers.get("content-type")).toStrictEqual("text/javascript");
    expect(response?.headers.get("cache-control")).toStrictEqual(
      "public, max-age=31536000, immutable",
    );
    expect(await response?.text()).toStrictEqual("export {};");
  });

  test("serves other files, e.g. from Vite's public dir, cached briefly", async () => {
    const response = await get("/robots.txt");
    expect(response?.status).toStrictEqual(200);
    expect(response?.headers.get("cache-control")).toStrictEqual("public, max-age=3600");
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
