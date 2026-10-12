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
export function huuma(): Plugin[] {
  return [configPlugin()];
}

/** Settings every Huuma app needs. */
function configPlugin(): Plugin {
  return {
    name: "huuma:config",
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
