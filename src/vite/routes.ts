import type { Plugin } from "vite";
import { join } from "node:path";

import { type FileImport, listPages, type Routes } from "../platform/server/discover.ts";

/**
 * The app's pages with their layouts and middlewares, in the shape
 * `packPages()` registers (`List["pages"]`).
 * Server only: it imports every page module.
 */
export const ROUTES_ID = "virtual:huuma/routes";
const RESOLVED_ROUTES_ID = `\0${ROUTES_ID}`;

/**
 * Serves `virtual:huuma/routes` for the routes directory `routesDir()`
 * (absolute), discovered on every load.
 */
export function routesPlugin(routesDir: () => string): Plugin {
  return {
    name: "huuma:routes",
    resolveId: {
      filter: { id: new RegExp(`^${escapeRegExp(ROUTES_ID)}$`) },
      handler() {
        return RESOLVED_ROUTES_ID;
      },
    },
    load: {
      filter: { id: new RegExp(`^${escapeRegExp(RESOLVED_ROUTES_ID)}$`) },
      async handler() {
        if (this.environment.config.consumer !== "server") {
          this.error(`${ROUTES_ID} imports every page and is server only.`);
        }
        const dir = routesDir();
        try {
          return { code: routesModule(await listPages(dir)), moduleType: "js" };
        } catch (error) {
          if ((error as { code?: string }).code === "ENOENT") {
            this.error(`The routes directory "${dir}" doesn't exist.`);
          }
          throw error;
        }
      },
    },
  };
}

/** Generates the source of `virtual:huuma/routes`. */
export function routesModule(routes: Routes): string {
  const pages = routes.pages.map(({ page, layouts, middlewares }) => {
    return [
      `  ${JSON.stringify(page.routePath)}: {`,
      `    page: ${page.name},`,
      `    layouts: [${layouts.join(", ")}],`,
      // Discovery lists middlewares deepest first; they run outermost first,
      // as the Deno pipeline ordered them.
      `    middleware: [${[...middlewares].reverse().join(", ")}],`,
      "  },",
    ].join("\n");
  });
  return [
    ...imports(routes.pages.map(({ page }) => page)),
    ...imports(routes.layouts),
    ...imports(routes.middlewares),
    "",
    "export default {",
    ...pages,
    "};",
    "",
  ].join("\n");
}

function imports(files: FileImport[]): string[] {
  return files.map((file) => `import * as ${file.name} from ${JSON.stringify(modulePath(file))};`);
}

/** An absolute file path as an import specifier, with `/` on every OS. */
export function modulePath(file: FileImport): string {
  return join(file.filePath, file.fileName).replaceAll("\\", "/");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
