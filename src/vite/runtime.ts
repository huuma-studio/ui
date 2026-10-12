/*
 * Runs in the app's server (Vite's ssr environment), not in the Vite
 * config: the server entry the plugin generates imports it. Not meant for
 * app code; its API can change with the plugin.
 */
import type { JSX } from "../jsx-runtime/mod.ts";
import type { UIApp, UIAppContext } from "../platform/server/app.ts";
import type { List } from "../platform/server/pack/mod.ts";
import { packPages } from "../platform/server/pack/pack.ts";

/** What the plugin's virtual modules provide. */
export interface Manifest {
  /** `virtual:huuma/routes`. */
  pages: List["pages"];
  /** `virtual:huuma/islands`: island modules by browser path. */
  islands: Record<string, { default?: JSX.Component }>;
  /** The browser path of `virtual:huuma/runtime`. */
  runtime: string;
}

/**
 * Registers the plugin's modules on `app`, like `pack()` does for the Deno
 * pipeline: the browser runtime, the islands and the pages. Vite serves
 * the scripts, so the app only references them.
 */
export function mount<T extends UIAppContext>(app: UIApp<T>, manifest: Manifest): UIApp<T> {
  app.addScript(manifest.runtime, undefined, { isRuntime: true });

  for (const [path, island] of Object.entries(manifest.islands)) {
    if (typeof island.default !== "function") {
      throw new TypeError(`The island "${path}" has no component as its default export.`);
    }
    app.addIsland(island.default, { path });
  }

  packPages(manifest.pages, app);
  return app;
}
