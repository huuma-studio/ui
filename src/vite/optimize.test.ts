import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, type ViteDevServer } from "vite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { huuma } from "./mod.ts";
import { INSTALLED, optimizeDepsPlugin } from "./optimize.ts";

const root = fileURLToPath(new URL("../../test/fixtures/basic", import.meta.url));

// How Vite's scan resolves, with a flag its types don't have.
const SCAN = { scan: true } as Record<string, unknown>;

describe("dependency pre-bundling", () => {
  let server: ViteDevServer;
  beforeAll(async () => {
    server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma({ routes: "app", server: "server.ts" })],
    });
  });
  afterAll(async () => {
    await server.close();
  });

  test("scans the islands for the browser", () => {
    expect(server.environments.client.config.optimizeDeps.entries).toStrictEqual([
      "**/*.client.tsx",
    ]);
  });

  test("doesn't pre-bundle the browser runtime of @huuma/ui as source", () => {
    // This repository's @huuma/ui, as a linked one, isn't in node_modules.
    expect(INSTALLED).toStrictEqual(false);
    expect(server.environments.client.config.optimizeDeps.include ?? []).not.toContain(
      "@huuma/ui/browser",
    );
  });

  test("pre-bundles the browser runtime of an installed @huuma/ui up front", async () => {
    const installed = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [optimizeDepsPlugin(() => ({ routes: "app", server: "server.ts" }), true)],
    });
    try {
      expect(installed.environments.client.config.optimizeDeps.include).toContain(
        "@huuma/ui/browser",
      );
      expect(installed.environments.ssr.config.optimizeDeps.include ?? []).not.toContain(
        "@huuma/ui/browser",
      );
    } finally {
      await installed.close();
    }
  });

  test("scans the routes and the server entry for the server, without tests", () => {
    expect(server.environments.ssr.config.optimizeDeps.entries).toStrictEqual([
      "app/**/*.{ts,tsx}",
      "server.ts",
      "!**/*.test.*",
      "!**/*.spec.*",
    ]);
  });

  test("leaves other server environments alone", async () => {
    const other = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      environments: { worker: { consumer: "server" } },
      plugins: [huuma()],
    });
    try {
      expect(other.environments.worker?.config.optimizeDeps.entries).toBeUndefined();
    } finally {
      await other.close();
    }
  });

  test("doesn't follow remote or server-only modules in the browser's scan", async () => {
    const importer = join(root, "app/counter.client.tsx");
    const scan = (id: string) =>
      server.environments.client.pluginContainer.resolveId(id, importer, SCAN);
    expect((await scan("./sum.remote.ts"))?.id).toContain("\0");
    expect((await scan("./host.server.ts"))?.id).toContain("\0");
    expect((await scan("./page.tsx"))?.id).toStrictEqual(join(root, "app/page.tsx"));
  });

  test("resolves remote and server-only modules as usual outside the scan", async () => {
    const importer = join(root, "app/counter.client.tsx");
    const client = await server.environments.client.pluginContainer.resolveId(
      "./sum.remote.ts",
      importer,
    );
    expect(client?.id).toStrictEqual(join(root, "app/sum.remote.ts"));
    const ssr = await server.environments.ssr.pluginContainer.resolveId(
      "./host.server.ts",
      importer,
      SCAN,
    );
    expect(ssr?.id).toStrictEqual(join(root, "app/host.server.ts"));
  });
});
