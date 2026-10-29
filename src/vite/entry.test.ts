import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, type RunnableDevEnvironment, type ViteDevServer } from "vite";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { buildFixture, fixtures } from "../../test/build.ts";
import { SERVER_ID, serverModule } from "./entry.ts";
import { huuma } from "./mod.ts";

// The basic fixture's server entry, with named exports next to the app,
// e.g. a Durable Object class for Cloudflare Workers.
const SERVER = [
  'import { createUIApp } from "@huuma/ui/server";',
  'import Root from "./app/root.tsx";',
  "",
  "export class ChatRoom {",
  "  name() {",
  '    return "chat-room";',
  "  }",
  "}",
  'export const region = "eu";',
  "",
  "export default createUIApp(Root);",
  "",
].join("\n");

interface Entry {
  default: { fetch(request: Request, connection: unknown): Promise<Response> };
  ChatRoom: new () => { name(): string };
  region: string;
}

describe(serverModule.name, () => {
  test("re-exports the server entry's named exports, next to the mounted app", () => {
    const code = serverModule("C:\\app\\server.ts", "/assets/runtime.js");
    expect(code).toContain('import app from "C:/app/server.ts";');
    expect(code).toContain('export * from "C:/app/server.ts";');
    expect(code).toContain("export default mount(app, ");
  });
});

describe("the server entry's named exports", () => {
  test("are exports of the built app.js", async () => {
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const root = await buildFixture(".tmp-build-exports-", {}, { "server.ts": SERVER });
    try {
      const entry = (await import(pathToFileURL(join(root, "dist/server/app.js")).href)) as Entry;
      expect(Object.keys(entry).sort()).toStrictEqual(["ChatRoom", "default", "region"]);
      expect(new entry.ChatRoom().name()).toStrictEqual("chat-room");
      expect(entry.region).toStrictEqual("eu");
      // The default export is still the mounted app, not the server entry's.
      const response = await entry.default.fetch(new Request("http://localhost/about"), {
        remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 },
      });
      expect(await response.text()).toContain("<h1>About</h1>");
    } finally {
      process.env.NODE_ENV = nodeEnv;
      await rm(root, { recursive: true, force: true });
    }
  });

  describe("in dev", () => {
    let root: string;
    let server: ViteDevServer;
    beforeAll(async () => {
      root = await mkdtemp(join(fixtures, ".tmp-dev-exports-"));
      await cp(join(fixtures, "basic"), root, { recursive: true });
      await writeFile(join(root, "server.ts"), SERVER);
      server = await createServer({
        root,
        configFile: false,
        logLevel: "silent",
        server: { middlewareMode: true, ws: false },
        plugins: [huuma()],
      });
    });
    afterAll(async () => {
      await server.close();
      await rm(root, { recursive: true, force: true });
    });

    test("are exports of the entry the runner imports", async () => {
      const ssr = server.environments.ssr as RunnableDevEnvironment;
      const entry = (await ssr.runner.import(SERVER_ID)) as Entry;
      expect(new entry.ChatRoom().name()).toStrictEqual("chat-room");
      expect(entry.region).toStrictEqual("eu");
      expect(typeof entry.default.fetch).toStrictEqual("function");
    });
  });

  test("leave a server entry with only a default export as it was", async () => {
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const root = await buildFixture(".tmp-build-default-");
    try {
      const entry = (await import(pathToFileURL(join(root, "dist/server/app.js")).href)) as object;
      expect(Object.keys(entry)).toStrictEqual(["default"]);
    } finally {
      process.env.NODE_ENV = nodeEnv;
      await rm(root, { recursive: true, force: true });
    }
  });
});
