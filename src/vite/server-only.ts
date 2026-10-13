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
  // The build's importers by server-only module: Rolldown doesn't know a
  // module's importers yet while loading it.
  const importers = new Map<string, Set<string>>();
  return {
    name: "huuma:server-only",
    // Before any other plugin loads the module.
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.config.consumer === "client";
    },
    resolveId: {
      filter: { id: /\.server\./ },
      async handler(source, importer, options) {
        if (!importer || "moduleGraph" in this.environment) return;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (resolved && SERVER_ONLY.test(resolved.id)) {
          const known = importers.get(resolved.id) ?? new Set();
          importers.set(resolved.id, known.add(importer));
        }
        return resolved;
      },
    },
    load: {
      filter: { id: { include: SERVER_ONLY, exclude: /[\\/]node_modules[\\/]/ } },
      handler(id) {
        const root = this.environment.config.root;
        const file = id.replace(/\?.*$/, "");
        const by = importersOf(this, id, importers).map((importer) => relative(root, importer));
        this.error(
          `"${relative(root, file)}" is server-only code and can't be imported in the browser` +
            (by.length ? ` (imported by ${by.join(", ")}).` : ".") +
            " Import it from server code, e.g. a remote function (`*.remote.ts`).",
        );
      },
    },
  };
}

type LoadContext = ThisParameterType<Extract<Plugin["load"], { handler: unknown }>["handler"]>;

/**
 * The modules that import `id`: from the dev server's module graph, or
 * the ones `resolveId` recorded in the build.
 */
function importersOf(
  context: LoadContext,
  id: string,
  recorded: Map<string, Set<string>>,
): string[] {
  const environment = context.environment;
  if ("moduleGraph" in environment) {
    const module = environment.moduleGraph.getModuleById(id);
    return [...(module?.importers ?? [])].map((importer) => importer.file ?? importer.id ?? "");
  }
  return [...(recorded.get(id) ?? context.getModuleInfo(id)?.importers ?? [])];
}
