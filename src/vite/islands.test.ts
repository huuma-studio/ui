import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, isRunnableDevEnvironment, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";

import type { JSX } from "../jsx-runtime/mod.ts";
import { huuma } from "./mod.ts";
import { ISLANDS_ID, islandPath, RUNTIME_ID, runtimePath } from "./islands.ts";

const fixture = fileURLToPath(new URL("../../test/fixtures/basic", import.meta.url));

describe("browser paths", () => {
  test("are relative to the root and start with the base", () => {
    expect(islandPath("/srv/app", "/", "/srv/app/app/counter.client.tsx")).toStrictEqual(
      "app/counter.client.tsx",
    );
    expect(islandPath("/srv/app", "/shop/", "/srv/app/app/counter.client.tsx")).toStrictEqual(
      "shop/app/counter.client.tsx",
    );
    // Encoded, so the browser requests the file Vite serves.
    expect(
      islandPath("/srv/app", "/", "/srv/app/components/50%off a/tag.client.tsx"),
    ).toStrictEqual("components/50%25off%20a/tag.client.tsx");
    expect(runtimePath("/")).toStrictEqual("@id/__x00__virtual:huuma/runtime");
    expect(runtimePath("/shop/")).toStrictEqual("shop/@id/__x00__virtual:huuma/runtime");
  });
});

describe("island modules", () => {
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

  test(`${ISLANDS_ID} maps browser paths to the islands on the server`, async () => {
    const ssr = server.environments.ssr;
    if (!isRunnableDevEnvironment(ssr)) throw new Error("ssr environment is not runnable");
    const { default: islands } = (await ssr.runner.import(ISLANDS_ID)) as {
      default: Record<string, { default: JSX.Component }>;
    };

    // Project-wide, including islands outside the routes directory.
    expect(Object.keys(islands).sort()).toStrictEqual([
      "app/counter.client.tsx",
      "app/remote/sum.client.tsx",
      "components/greeting.client.tsx",
    ]);
    // The same module instance a page gets when it imports the island:
    // the server recognizes islands by component identity.
    const page = (await ssr.runner.import("/app/counter.client.tsx")) as {
      default: JSX.Component;
    };
    expect(islands["app/counter.client.tsx"].default).toBe(page.default);
  });

  test(`${RUNTIME_ID} exports the browser runtime to the client`, async () => {
    const result = await server.environments.client.transformRequest(RUNTIME_ID);
    expect(result?.code).toMatch(
      /export \{ launch \} from "[^"]*\/src\/platform\/browser\/mod\.ts"/,
    );
  });

  test("each stays in its environment", async () => {
    await expect(server.environments.client.transformRequest(ISLANDS_ID)).rejects.toThrow(
      "server only",
    );
    await expect(server.environments.ssr.transformRequest(RUNTIME_ID)).rejects.toThrow(
      "browser runtime",
    );
  });
});
