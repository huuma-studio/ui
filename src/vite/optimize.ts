import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";

import { REMOTE_MODULE } from "./remote.ts";
import { SERVER_ONLY } from "./server-only.ts";

/** Where the app's modules are, relative to Vite's `root`. */
export interface AppModules {
  /** The routes directory, e.g. `app`. */
  routes: string;
  /** The server entry, e.g. `server.ts`. */
  server: string;
}

// Patterns Vite's scan leaves out of the server's entries.
const NOT_APP_CODE = ["!**/*.test.*", "!**/*.spec.*"];

const NODE_MODULES = /[\\/]node_modules[\\/]/;

/**
 * Whether this @huuma/ui is a dependency in `node_modules`, which Vite
 * pre-bundles, rather than source, e.g. linked or this repository, which
 * Vite serves as it is.
 */
export const INSTALLED: boolean =
  import.meta.url.startsWith("file:") && NODE_MODULES.test(fileURLToPath(import.meta.url));

/**
 * Lets Vite find the app's dependencies before the first request.
 *
 * Vite pre-bundles dependencies (`optimizeDeps`) from what it finds by
 * scanning its entries, but the app reaches its pages and islands through
 * Huuma's virtual modules, which the scan can't follow. Without help it
 * found each dependency on the first request that used it, and pre-bundled
 * again: modules that had loaded kept the old bundle, so a page could get
 * a second copy of `@huuma/ui` ("No sync vnode scope found") or of a
 * library with global state (ProseMirror's "Duplicate use of selection
 * JSON ID"). So the scan starts from the islands (browser) and from the
 * routes and the server entry (ssr), and the browser runtime, which only
 * `virtual:huuma/runtime` imports, is included up front: unless `installed`
 * is false, as the islands' `@huuma/ui` imports then aren't pre-bundled
 * either.
 *
 * The browser's scan stops at remote and server-only modules: the browser
 * gets a stub of a remote module and never a server-only one, so their
 * dependencies would only be pre-bundled for nothing.
 */
export function optimizeDepsPlugin(app: () => AppModules, installed = INSTALLED): Plugin {
  return {
    name: "huuma:optimize-deps",
    configEnvironment(name, config) {
      const { routes, server } = app();
      if ((config.consumer ?? (name === "client" ? "client" : "server")) === "client") {
        return {
          optimizeDeps: {
            entries: ["**/*.client.tsx"],
            ...(installed ? { include: ["@huuma/ui/browser"] } : {}),
          },
        };
      }
      // The environment Huuma builds the app in. Without dependency
      // discovery, e.g. on Node, Vite doesn't scan.
      if (name === "ssr") {
        return {
          optimizeDeps: {
            entries: [`${routes}/**/*.{ts,tsx}`, server, ...NOT_APP_CODE],
          },
        };
      }
    },
    resolveId: {
      order: "pre",
      async handler(id, importer, options) {
        // Vite passes `scan` while scanning, though its types don't have it.
        const { scan } = options as { scan?: boolean };
        if (!scan || this.environment.config.consumer !== "client") return;
        const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
        if (
          resolved &&
          !resolved.external &&
          !NODE_MODULES.test(resolved.id) &&
          (REMOTE_MODULE.test(resolved.id) || SERVER_ONLY.test(resolved.id))
        ) {
          // Vite's scan doesn't follow a module whose id has a `\0`.
          return `\0huuma:server-module:${resolved.id}`;
        }
        return resolved;
      },
    },
  };
}
