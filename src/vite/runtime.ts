/*
 * Runs in the app's server (Vite's ssr environment), not in the Vite
 * config: the server entry the plugin generates imports it. Not meant for
 * app code; its API can change with the plugin.
 */
import type { JSX } from "../jsx-runtime/mod.ts";
import type { UIApp, UIAppContext } from "../platform/server/app.ts";
import type { List } from "../platform/server/pack/mod.ts";
import { packPages, serveRemoteFunctions } from "../platform/server/pack/pack.ts";
import { belowBase } from "./base.ts";
import { withViteClient } from "./vite-client.ts";

/** What the plugin's virtual modules provide. */
export interface Manifest {
  /** `virtual:huuma/routes`. */
  pages: List["pages"];
  /** `virtual:huuma/islands`: island modules by browser path. */
  islands: Record<string, { default?: JSX.Component }>;
  /** `virtual:huuma/remote`: remote modules by endpoint. */
  remote: NonNullable<List["remoteFunctions"]>;
  /** The browser path of `virtual:huuma/runtime`. */
  runtime: string;
}

// Marks an app `mount()` registered the modules on. A key from the global
// symbol registry, not a set here: this module can be evaluated again too.
const MOUNTED = Symbol.for("huuma.mounted");

/**
 * Registers the plugin's modules on `app`: the browser runtime, the
 * islands, the remote functions and the pages. Vite serves the scripts, so the app only references them.
 * Mounting the same app again does nothing: a dev server's module runner
 * can evaluate the server entry a second time against the cached app,
 * whose router would reject the routes it already has.
 */
export function mount<T extends UIAppContext>(app: UIApp<T>, manifest: Manifest): UIApp<T> {
  // The server entry's default export, which nothing type-checks.
  if (typeof (app as Partial<UIApp<T>> | undefined)?.addPage !== "function") {
    throw new TypeError(
      "The server entry must export the app as default: `export default createUIApp(Root);`",
    );
  }
  const marked = app as UIApp<T> & { [MOUNTED]?: true };
  if (marked[MOUNTED]) return app;
  marked[MOUNTED] = true;
  app.addScript(manifest.runtime, undefined, { isRuntime: true });

  for (const [path, island] of Object.entries(manifest.islands)) {
    if (typeof island.default !== "function") {
      throw new TypeError(`The island "${path}" has no component as its default export.`);
    }
    app.addIsland(island.default, { path });
  }

  for (const [endpoint, functions] of Object.entries(manifest.remote)) {
    serveRemoteFunctions(app, endpoint, functions);
  }

  packPages(manifest.pages, app);
  return app;
}

/** A handler with a Worker's `fetch`, like the app. */
interface FetchHandler {
  fetch(request: Request, env?: unknown, ctx?: unknown): Promise<Response>;
}

/**
 * The app as a Cloudflare Worker (`worker.js`). Workers' static assets
 * serve the client build before the Worker runs, below the base too: the
 * build puts the files in `dist/client` at their URLs' paths. Below a
 * base other than `/`, e.g. `/shop/`, the Worker strips the base for the
 * app, like `server.js`.
 */
export function worker(app: FetchHandler, base: string): FetchHandler {
  if (base === "/") return app;
  return {
    fetch(request, env, ctx) {
      const below = belowBase(request, base);
      return below instanceof Response ? Promise.resolve(below) : app.fetch(below, env, ctx);
    },
  };
}

/**
 * Adds Vite's client to the app's HTML responses: the Worker entry in dev,
 * where the app runs in a platform's runtime and Huuma's Node middleware
 * never sees the response. `base` is Vite's `base`.
 */
export function withDevClient(app: FetchHandler, base: string): FetchHandler {
  return {
    async fetch(request, env, ctx) {
      const response = await app.fetch(request, env, ctx);
      return response.headers.get("content-type")?.startsWith("text/html")
        ? withViteClient(response, base)
        : response;
    },
  };
}
