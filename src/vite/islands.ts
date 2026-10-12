import type { Plugin } from "vite";
import { join, relative } from "node:path";

import { listIslands } from "../platform/server/discover.ts";

/**
 * Every island module by the path the browser loads it from (without the
 * leading `/`, like `UIApp` script paths). Server only: the server needs
 * the components to find islands while rendering, and the paths for the
 * `Launch` script.
 */
export const ISLANDS_ID = "virtual:huuma/islands";

/**
 * The browser runtime (`launch`) as a client module. Served by Vite like
 * the islands, so both import `@huuma/ui` through the same (optimized)
 * modules and share one signal runtime.
 */
export const RUNTIME_ID = "virtual:huuma/runtime";
const RESOLVED_RUNTIME_ID = `\0${RUNTIME_ID}`;

export interface IslandsOptions {
  /** Vite's resolved `root`: islands are discovered below it. */
  root: string;
  /** Vite's resolved `base`, which the browser paths start with. */
  base: string;
}

/** Serves `virtual:huuma/islands` (server) and `virtual:huuma/runtime` (client). */
export function islandsPlugin(options: () => IslandsOptions): Plugin {
  return {
    name: "huuma:islands",
    resolveId: {
      filter: { id: new RegExp(`^(${ISLANDS_ID}|${RUNTIME_ID})$`) },
      handler(id) {
        return `\0${id}`;
      },
    },
    load: {
      filter: { id: new RegExp(`^\0(${ISLANDS_ID}|${RUNTIME_ID})$`) },
      async handler(id) {
        const consumer = this.environment.config.consumer;
        if (id === RESOLVED_RUNTIME_ID) {
          if (consumer !== "client") this.error(`${RUNTIME_ID} is the browser runtime.`);
          return { code: 'export { launch } from "@huuma/ui/browser";\n', moduleType: "js" };
        }
        if (consumer !== "server") {
          this.error(`${ISLANDS_ID} imports every island for the server and is server only.`);
        }
        const { root, base } = options();
        const islands = (await listIslands(root)).map((island) => {
          const file = join(island.filePath, island.fileName);
          return { name: island.name, file, path: islandPath(root, base, file) };
        });
        return { code: islandsModule(islands), moduleType: "js" };
      },
    },
  };
}

/** Generates the source of `virtual:huuma/islands`. */
export function islandsModule(islands: { name: string; file: string; path: string }[]): string {
  return [
    ...islands.map(
      ({ name, file }) => `import * as ${name} from ${JSON.stringify(file.replaceAll("\\", "/"))};`,
    ),
    "",
    "export default {",
    ...islands.map(({ name, path }) => `  ${JSON.stringify(path)}: ${name},`),
    "};",
    "",
  ].join("\n");
}

/**
 * The path the browser loads an island file from, e.g.
 * `app/counter.client.tsx`. Each segment is URL-encoded: a raw `%` or `?`
 * in a directory name would change the URL. (`#` doesn't work either way:
 * Vite can't load files with `#` in their path.)
 */
export function islandPath(root: string, base: string, file: string): string {
  const segments = relative(root, file).split(/[\\/]/).map(encodeURIComponent);
  return withoutLeadingSlash(base + segments.join("/"));
}

/**
 * The path the browser loads the runtime from. Vite serves a virtual
 * module at `/@id/` plus its id, with the leading `\0` as `__x00__`.
 */
export function runtimePath(base: string): string {
  return withoutLeadingSlash(`${base}@id/__x00__${RUNTIME_ID}`);
}

function withoutLeadingSlash(path: string): string {
  return path.replace(/^\//, "");
}
