import type { Plugin } from "vite";
import { relative, resolve, sep } from "node:path";

import type { HuumaAdapter } from "./adapter.ts";
import { appBase } from "./base.ts";
import { readClientBuild } from "./client-build.ts";
import { SERVER_ID } from "./entry.ts";

/**
 * Starts the built app on Node, serving the client build's files too:
 * `dist/server/server.js`. Server only, in the production build.
 */
export const NODE_ID = "virtual:huuma/node";
const RESOLVED_NODE_ID = `\0${NODE_ID}`;

/**
 * The adapter for Node, `huuma()`'s default: the build adds `server.js`,
 * which starts the app with `@huuma/ui/vite/node`, and the dev server runs
 * the app's server code in Vite's process.
 */
export function node(): HuumaAdapter {
  return { name: "node", plugins: [nodePlugin()] };
}

function nodePlugin(): Plugin {
  return {
    name: "huuma:node",
    config() {
      return {
        environments: {
          ssr: { build: { rolldownOptions: { input: { server: NODE_ID } } } },
        },
      };
    },
    resolveId: {
      filter: { id: new RegExp(`^${NODE_ID}$`) },
      handler() {
        return RESOLVED_NODE_ID;
      },
    },
    load: {
      filter: { id: new RegExp(`^\0${NODE_ID}$`) },
      async handler() {
        if (this.environment.config.consumer !== "server" || this.environment.mode !== "build") {
          this.error(`${NODE_ID} starts the built app and is only part of the server build.`);
        }
        const config = this.environment.getTopLevelConfig();
        const client = resolve(config.root, config.environments.client.build.outDir);
        const server = resolve(config.root, this.environment.config.build.outDir);
        // A URL relative to `server.js`: each directory's name encoded,
        // as it can come from the base, e.g. `sale%` from `/sale%25/`.
        const url = relative(server, client).split(sep).map(encodeURIComponent).join("/");
        return {
          code: nodeModule({
            client: `${url}/`,
            base: appBase(config.base),
            hashed: (await readClientBuild(config)).hashed,
          }),
          moduleType: "js",
        };
      },
    },
  };
}

/**
 * Generates the source of `virtual:huuma/node`. `client` is the client
 * build's directory relative to the server build's.
 */
export function nodeModule(options: { client: string; base: string; hashed: string[] }): string {
  return [
    `import app from ${JSON.stringify(SERVER_ID)};`,
    'import { start } from "@huuma/ui/vite/node";',
    "",
    "await start(app, {",
    `  client: new URL(${JSON.stringify(options.client)}, import.meta.url),`,
    `  base: ${JSON.stringify(options.base)},`,
    `  hashed: ${JSON.stringify(options.hashed)},`,
    "});",
    "",
  ].join("\n");
}
