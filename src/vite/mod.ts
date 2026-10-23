/*
 * The Huuma UI plugin for Vite 8 (spec #126): Vite discovers, transforms and
 * serves the app. It replaced the Deno build pipeline and its `.huuma/`
 * codegen.
 *
 * Only types are imported from `vite`: JSR has no peer dependencies, and a
 * runtime import could install a second copy of Vite next to the app's.
 * Runtime APIs come through the hook arguments instead.
 */
import type { Plugin, PluginOption } from "vite";
import { resolve } from "node:path";

import type { HuumaAdapter } from "./adapter.ts";
import { buildPlugin } from "./build.ts";
import { devPlugin } from "./dev.ts";
import { type DecoratorsOption, decoratorsPlugin } from "./decorators.ts";
import { entryPlugin } from "./entry.ts";
import { denoEnvPlugin } from "./env.ts";
import { islandsPlugin } from "./islands.ts";
import { node } from "./node-adapter.ts";
import { remotePlugin } from "./remote.ts";
import { routesPlugin } from "./routes.ts";
import { serverOnlyPlugin } from "./server-only.ts";
import { wranglerAssetsPlugin } from "./workers.ts";

export type { HuumaAdapter } from "./adapter.ts";
export { node } from "./node-adapter.ts";

/** Options of the Huuma UI plugin. */
export interface HuumaOptions {
  /**
   * The directory with the app's `page.tsx`, `layout.tsx` and
   * `middleware.ts` files, relative to Vite's `root`. Defaults to `"app"`.
   */
  routes?: string;
  /**
   * The module that exports the app (`createUIApp(Root)`) as default,
   * relative to Vite's `root`. Defaults to `"server.ts"`.
   */
  server?: string;
  /**
   * Lowers standard decorators (e.g. `@inject()` from `@huuma/inject`)
   * with Babel, in the modules that use them. Needs `@babel/core` and
   * `@babel/plugin-proposal-decorators` in the app's dependencies.
   * `"auto"` (the default) does it unless Oxc's legacy decorators are
   * turned on with `oxc.decorator.legacy`; `false` leaves decorators
   * alone. `experimentalDecorators` in a tsconfig.json alone doesn't turn
   * it off: set `oxc.decorator.legacy: true` for legacy decorators.
   */
  decorators?: DecoratorsOption;
  /**
   * The platform the app runs on. Defaults to `node()`: `vite build` adds
   * `dist/server/server.js`, which starts the app on Node.
   */
  adapter?: HuumaAdapter;
}

/**
 * Creates the Huuma UI plugins for Vite 8.
 *
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { huuma } from "@huuma/ui/vite";
 *
 * export default defineConfig({ plugins: [huuma()] });
 * ```
 */
export function huuma(options: HuumaOptions = {}): PluginOption[] {
  // Vite's resolved config, known once Vite resolved it.
  const app = { root: "", base: "/" };
  const serverEntry = () => resolve(app.root, options.server ?? "server.ts");
  return [
    configPlugin((config) => {
      app.root = config.root;
      app.base = config.base;
    }),
    routesPlugin(() => resolve(app.root, options.routes ?? "app")),
    islandsPlugin(() => app),
    remotePlugin(() => app.root),
    serverOnlyPlugin(),
    denoEnvPlugin(),
    decoratorsPlugin(
      () => options.decorators ?? "auto",
      () => app.root,
    ),
    entryPlugin(() => ({ server: serverEntry(), base: app.base })),
    devPlugin(serverEntry),
    buildPlugin(() => app.root),
    wranglerAssetsPlugin(),
    // After Huuma's own: see `HuumaAdapter.plugins`.
    ...((options.adapter ?? node()).plugins ?? []),
  ];
}

/** Settings every Huuma app needs. */
function configPlugin(onResolved: (config: { root: string; base: string }) => void): Plugin {
  return {
    name: "huuma:config",
    configResolved(config) {
      onResolved(config);
    },
    config() {
      return {
        // Huuma renders its own HTML: no index.html, no SPA fallback.
        appType: "custom",
        // `import.meta.env.PUBLIC_*` in browser code, as with the Deno
        // pipeline. An array, so Vite adds it to an app's own prefixes.
        envPrefix: ["PUBLIC_"],
        oxc: {
          jsx: { runtime: "automatic", importSource: "@huuma/ui" },
        },
      };
    },
  };
}
