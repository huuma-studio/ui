import type { Plugin } from "vite";
import { relative } from "node:path";

/**
 * A server-only module of the app: `*.server.*` with any extension, e.g.
 * `db.server.ts` or `keys.server.json`, with an optional query.
 */
export const SERVER_ONLY: RegExp = /\.server\.[^/\\?]+(\?.*)?$/;

/**
 * Fails when browser code imports a server-only module (`*.server.*`),
 * in the dev server and in the build. The server still loads them.
 * Dependencies in `node_modules` aren't checked: their file names aren't
 * the app's convention.
 */
export function serverOnlyPlugin(): Plugin {
  // The build's server-only modules, reported in `buildEnd`: Rolldown
  // doesn't know a module's importers yet while loading it.
  const loaded = new Set<string>();
  return {
    name: "huuma:server-only",
    // Before any other plugin loads the module.
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.config.consumer === "client";
    },
    buildStart() {
      loaded.clear();
    },
    load: {
      filter: { id: { include: SERVER_ONLY, exclude: /[\\/]node_modules[\\/]/ } },
      handler(id) {
        const environment = this.environment;
        if ("moduleGraph" in environment) {
          const module = environment.moduleGraph.getModuleById(id);
          const importers = [...(module?.importers ?? [])].map(
            (importer) => importer.file ?? importer.id ?? "",
          );
          this.error(serverOnlyError(environment.config.root, id, importers));
        }
        // An empty module until the build fails in `buildEnd`, before
        // Rolldown links the modules.
        loaded.add(id);
        return { code: "export {};", moduleType: "js" };
      },
    },
    buildEnd(error) {
      if (error || !loaded.size) return;
      const root = this.environment.config.root;
      this.error(
        [...loaded]
          .map((id) => serverOnlyError(root, id, this.getModuleInfo(id)?.importers ?? []))
          .join("\n"),
      );
    },
  };
}

function serverOnlyError(root: string, id: string, importers: readonly string[]): string {
  const file = id.replace(/\?.*$/, "");
  const by = importers.map((importer) => relative(root, importer));
  return (
    `"${relative(root, file)}" is server-only code and can't be imported in the browser` +
    (by.length ? ` (imported by ${by.join(", ")}).` : ".") +
    " Import it from server code, e.g. a remote function (`*.remote.ts`)."
  );
}
