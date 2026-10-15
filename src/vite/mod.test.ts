import { afterEach, describe, expect, test } from "vite-plus/test";
import { createServer, type PluginOption, type ViteDevServer } from "vite";

import { huuma } from "./mod.ts";

describe(huuma.name, () => {
  let server: ViteDevServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  test("is a Vite plugin option", () => {
    // Type-level: fails `vp check` if the plugins stop matching Vite's types.
    const option: PluginOption = huuma();
    expect(Array.isArray(option)).toStrictEqual(true);
  });

  test("configures a custom app with Huuma's JSX runtime", async () => {
    server = await createServer({
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma()],
    });

    expect(server.config.appType).toStrictEqual("custom");
    // Vite adds `development: true` in dev: @huuma/ui/jsx-dev-runtime.
    expect(server.config.oxc && server.config.oxc.jsx).toMatchObject({
      runtime: "automatic",
      importSource: "@huuma/ui",
      development: true,
    });
  });

  test("exposes PUBLIC_* env vars, in addition to an app's own prefixes", async () => {
    server = await createServer({
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma()],
    });
    expect(server.config.envPrefix).toStrictEqual(["PUBLIC_"]);
    await server.close();

    server = await createServer({
      configFile: false,
      logLevel: "silent",
      envPrefix: "VITE_",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma()],
    });
    expect(server.config.envPrefix).toStrictEqual(["VITE_", "PUBLIC_"]);
  });
});
