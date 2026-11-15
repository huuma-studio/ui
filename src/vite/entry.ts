import type { Plugin } from "vite";
import { access } from "node:fs/promises";

import { readClientBuild } from "./client-build.ts";
import { ISLANDS_ID, runtimePath } from "./islands.ts";
import { REMOTE_ID } from "./remote.ts";
import { ROUTES_ID } from "./routes.ts";

/**
 * The app's server entry: the app from the `server` option with the
 * plugin's routes, islands, remote functions and runtime mounted, as its
 * default export. Its `fetch()` handles requests and initializes the app
 * on the first one. The dev server loads it per request; the production
 * build makes it `app.js`, with the built browser paths of the runtime and
 * the islands from the client build.
 *
 * It re-exports the server entry's named exports too, e.g. a Durable
 * Object class on Cloudflare Workers, which the platform looks for in the
 * Worker's main module. Its default export stays the mounted app.
 */
export const SERVER_ID = "virtual:huuma/server";
const RESOLVED_SERVER_ID = `\0${SERVER_ID}`;

export interface EntryOptions {
  /** The absolute path of the module that exports the `UIApp` as default. */
  server: string;
  /** Vite's resolved `base`. */
  base: string;
}

/** Serves `virtual:huuma/server`. */
export function entryPlugin(options: () => EntryOptions): Plugin {
  return {
    name: "huuma:entry",
    resolveId: {
      filter: { id: new RegExp(`^${SERVER_ID}$`) },
      handler() {
        return RESOLVED_SERVER_ID;
      },
    },
    load: {
      filter: { id: new RegExp(`^\0${SERVER_ID}$`) },
      async handler() {
        if (this.environment.config.consumer !== "server") {
          this.error(`${SERVER_ID} is the app's server and is server only.`);
        }
        const { server, base } = options();
        try {
          await access(server);
        } catch {
          this.error(
            `The server entry "${server}" doesn't exist. Export the app from it: ` +
              "`export default createUIApp(Root);`",
          );
        }
        // The built runtime is loaded from the client build's files.
        const runtime =
          this.environment.mode === "build"
            ? (await readClientBuild(this.environment.getTopLevelConfig())).runtime
            : runtimePath(base);
        return { code: serverModule(server, runtime), moduleType: "js" };
      },
    },
  };
}

/** Generates the source of `virtual:huuma/server`. */
export function serverModule(server: string, runtime: string): string {
  const entry = JSON.stringify(server.replaceAll("\\", "/"));
  return [
    `import app from ${entry};`,
    `import pages from ${JSON.stringify(ROUTES_ID)};`,
    `import islands from ${JSON.stringify(ISLANDS_ID)};`,
    `import remote from ${JSON.stringify(REMOTE_ID)};`,
    'import { mount } from "@huuma/ui/vite/runtime";',
    "",
    `export * from ${entry};`,
    `export default mount(app, { pages, islands, remote, runtime: ${JSON.stringify(runtime)} });`,
    "",
  ].join("\n");
}
