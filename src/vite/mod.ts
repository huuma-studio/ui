/*
 * The Huuma UI plugin for Vite 8 (spec #126). It replaces the Deno build
 * pipeline (`@huuma/ui/server/pack/list`): Vite discovers, transforms and
 * serves the app instead of the `.huuma/` codegen.
 *
 * Only types are imported from `vite`: JSR has no peer dependencies, and a
 * runtime import could install a second copy of Vite next to the app's.
 * Runtime APIs come through the hook arguments instead.
 */
import type { Plugin } from "vite";
import { resolve } from "node:path";

import { routesPlugin } from "./routes.ts";

/** Options of the Huuma UI plugin. */
export interface HuumaOptions {
  /**
   * The directory with the app's `page.tsx`, `layout.tsx` and
   * `middleware.ts` files, relative to Vite's `root`. Defaults to `"app"`.
   */
  routes?: string;
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
export function huuma(options: HuumaOptions = {}): Plugin[] {
  // Vite's resolved root, known once the config is resolved.
  let root = "";
  return [
    configPlugin((resolvedRoot) => {
      root = resolvedRoot;
    }),
    routesPlugin(() => resolve(root, options.routes ?? "app")),
  ];
}

/** Settings every Huuma app needs. */
function configPlugin(onRoot: (root: string) => void): Plugin {
  return {
    name: "huuma:config",
    configResolved(config) {
      onRoot(config.root);
    },
    config() {
      return {
        // Huuma renders its own HTML: no index.html, no SPA fallback.
        appType: "custom",
        oxc: {
          jsx: { runtime: "automatic", importSource: "@huuma/ui" },
        },
      };
    },
  };
}
