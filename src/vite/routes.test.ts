import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, isRunnableDevEnvironment, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";

import type { List } from "../platform/server/pack/mod.ts";
import { huuma } from "./mod.ts";
import { ROUTES_ID, routesModule } from "./routes.ts";

const fixture = fileURLToPath(new URL("../../test/fixtures/basic", import.meta.url));

describe(routesModule.name, () => {
  test("imports each module once and maps routes to them", () => {
    const file = (name: string, filePath: string, fileName: string) => ({
      name,
      filePath,
      fileName,
    });
    const code = routesModule({
      pages: [
        {
          page: { ...file("P0", "/app", "page.tsx"), routePath: "/" },
          layouts: ["L0"],
          middlewares: ["M1", "M0"],
        },
      ],
      layouts: [file("L0", "/app", "layout.tsx")],
      middlewares: [file("M1", "/app/admin", "middleware.ts"), file("M0", "/app", "middleware.ts")],
    });

    expect(code).toContain('import * as P0 from "/app/page.tsx";');
    expect(code).toContain('import * as L0 from "/app/layout.tsx";');
    expect(code).toContain('import * as M1 from "/app/admin/middleware.ts";');
    expect(code).toContain('"/": {\n    page: P0,\n    layouts: [L0],');
    // Outermost middleware first.
    expect(code).toContain("middleware: [M0, M1],");
  });
});

describe(ROUTES_ID, () => {
  let server: ViteDevServer;
  beforeAll(async () => {
    server = await createServer({
      root: fixture,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma()],
    });
  });
  afterAll(async () => {
    await server.close();
  });

  test("loads the fixture's pages, layouts and middlewares on the server", async () => {
    const ssr = server.environments.ssr;
    if (!isRunnableDevEnvironment(ssr)) throw new Error("ssr environment is not runnable");
    const { default: pages } = (await ssr.runner.import(ROUTES_ID)) as {
      default: List["pages"];
    };

    expect(Object.keys(pages)).toStrictEqual(["/", "/remote", "/context", "/about", "/!404"]);
    for (const route of Object.values(pages)) {
      expect(typeof route.page.default).toStrictEqual("function");
      expect(route.layouts.map((layout) => typeof layout.default)).toStrictEqual(["function"]);
      expect(route.middleware.map((module) => module.default.length)).toStrictEqual([1]);
    }
  });

  test("is server only", async () => {
    await expect(server.environments.client.transformRequest(ROUTES_ID)).rejects.toThrow(
      "server only",
    );
  });

  test("names a missing routes directory", async () => {
    const other = await createServer({
      root: fixture,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma({ routes: "pages" })],
    });
    try {
      const ssr = other.environments.ssr;
      if (!isRunnableDevEnvironment(ssr)) throw new Error("ssr environment is not runnable");
      await expect(ssr.runner.import(ROUTES_ID)).rejects.toThrow(/"[^"]*\/pages" doesn't exist/);
    } finally {
      await other.close();
    }
  });
});
