import type { Plugin, UserConfig } from "vite";
import { join, parse, relative, resolve } from "node:path";

import { listIslands } from "../platform/server/discover.ts";
import { RUNTIME_INPUT } from "./client-build.ts";
import { SERVER_ID } from "./entry.ts";
import { RUNTIME_ID } from "./islands.ts";

/**
 * Starts the built app on Node, serving the client build's files too:
 * `dist/server/server.js`. Server only, in the production build.
 */
export const NODE_ID = "virtual:huuma/node";
const RESOLVED_NODE_ID = `\0${NODE_ID}`;

/**
 * The production build (`vite build`): the client environment builds the
 * browser runtime and the islands into `dist/client`, with a manifest;
 * then the ssr environment builds the app into `dist/server`, reading the
 * client's manifest for the islands' browser paths: `app.js` exports the
 * app, `server.js` starts it on Node.
 */
export function buildPlugin(root: () => string): Plugin {
  return {
    name: "huuma:build",
    config(config) {
      const outDir = config.build?.outDir ?? "dist";
      return {
        // `vite build` builds every environment, through `buildApp`.
        builder: {},
        environments: {
          client: {
            build: {
              outDir: config.environments?.client?.build?.outDir ?? join(outDir, "client"),
              manifest: true,
              rolldownOptions: {
                // The islands are added in `buildStart`, once discovered.
                input: { [RUNTIME_INPUT]: RUNTIME_ID },
                // The page's launch script imports the runtime's `launch`
                // and each island's default export: Vite's app builds
                // would drop them as unused.
                preserveEntrySignatures: "exports-only",
              },
            },
          },
          ssr: {
            build: {
              outDir: config.environments?.ssr?.build?.outDir ?? join(outDir, "server"),
              rolldownOptions: { input: { app: SERVER_ID, server: NODE_ID } },
            },
          },
        },
      } satisfies UserConfig;
    },
    // The server reads the client's manifest, so the client builds first.
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.ssr);
    },
    resolveId: {
      filter: { id: new RegExp(`^${NODE_ID}$`) },
      handler() {
        return RESOLVED_NODE_ID;
      },
    },
    load: {
      filter: { id: new RegExp(`^\0${NODE_ID}$`) },
      handler() {
        if (this.environment.config.consumer !== "server" || this.environment.mode !== "build") {
          this.error(`${NODE_ID} starts the built app and is only part of the server build.`);
        }
        const config = this.environment.getTopLevelConfig();
        const client = resolve(config.root, config.environments.client.build.outDir);
        const server = resolve(config.root, this.environment.config.build.outDir);
        return {
          code: nodeModule({
            client: `${relative(server, client).replaceAll("\\", "/")}/`,
            base: config.base,
            assetsDir: config.environments.client.build.assetsDir,
          }),
          moduleType: "js",
        };
      },
    },
    async buildStart() {
      if (this.environment.config.consumer !== "client" || this.environment.mode !== "build") {
        return;
      }
      for (const island of await listIslands(root())) {
        this.emitFile({
          type: "chunk",
          id: join(island.filePath, island.fileName),
          name: parse(island.fileName).name,
          preserveSignature: "exports-only",
        });
      }
    },
  };
}

/**
 * Generates the source of `virtual:huuma/node`. `client` is the client
 * build's directory relative to the server build's.
 */
export function nodeModule(options: { client: string; base: string; assetsDir: string }): string {
  return [
    `import app from ${JSON.stringify(SERVER_ID)};`,
    'import { start } from "@huuma/ui/vite/node";',
    "",
    "await start(app, {",
    `  client: new URL(${JSON.stringify(options.client)}, import.meta.url),`,
    `  base: ${JSON.stringify(options.base)},`,
    `  assetsDir: ${JSON.stringify(options.assetsDir)},`,
    "});",
    "",
  ].join("\n");
}
