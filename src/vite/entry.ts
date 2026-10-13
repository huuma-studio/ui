import type { Plugin } from "vite";
import { access } from "node:fs/promises";

import { ISLANDS_ID, runtimePath } from "./islands.ts";
import { REMOTE_ID } from "./remote.ts";
import { ROUTES_ID } from "./routes.ts";

/**
 * The app's server entry: the app from the `server` option with the
 * plugin's routes, islands, remote functions and runtime mounted. Its default export handles
 * requests (`UIApp.deliver()`). The dev server loads it per request; the
 * production build will use it as its ssr entry.
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
        return { code: serverModule(server, runtimePath(base)), moduleType: "js" };
      },
    },
  };
}

/** Generates the source of `virtual:huuma/server`. */
export function serverModule(server: string, runtime: string): string {
  return [
    `import app from ${JSON.stringify(server.replaceAll("\\", "/"))};`,
    `import pages from ${JSON.stringify(ROUTES_ID)};`,
    `import islands from ${JSON.stringify(ISLANDS_ID)};`,
    `import remote from ${JSON.stringify(REMOTE_ID)};`,
    'import { mount } from "@huuma/ui/vite/runtime";',
    "",
    `export default mount(app, { pages, islands, remote, runtime: ${JSON.stringify(runtime)} }).deliver();`,
    "",
  ].join("\n");
}
