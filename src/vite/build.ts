import type { Plugin, Rolldown, UserConfig } from "vite";
import { join, parse, relative, resolve } from "node:path";

import { listIslands } from "../platform/server/discover.ts";
import { appBase } from "./base.ts";
import { RUNTIME_INPUT } from "./client-build.ts";
import { SERVER_ID } from "./entry.ts";
import { RUNTIME_ID } from "./islands.ts";
import { writeWorkersFiles } from "./workers.ts";

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
 * app, `server.js` starts it on Node. The client build also gets the files
 * Cloudflare Workers reads (`workers.ts`).
 */
export function buildPlugin(root: () => string): Plugin {
  // The client build's files with a content hash in their name, which
  // `server.js` caches for good.
  const hashed = new Set<string>();
  // The islands' files, which the client build emits as chunks.
  const islands = new Set<string>();
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
      const client = builder.environments.client;
      await builder.build(client);
      if (client.config.build.write) {
        await writeWorkersFiles({
          outDir: resolve(client.config.root, client.config.build.outDir),
          publicDir: client.config.publicDir,
          hashed,
          warn: (message) => client.logger.warn(message),
        });
      }
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
            base: appBase(config.base),
            hashed: [...hashed].sort(),
          }),
          moduleType: "js",
        };
      },
    },
    async buildStart() {
      if (this.environment.config.consumer !== "client" || this.environment.mode !== "build") {
        return;
      }
      hashed.clear();
      islands.clear();
      for (const island of await listIslands(root())) {
        const id = join(island.filePath, island.fileName);
        islands.add(id);
        this.emitFile({
          type: "chunk",
          id,
          name: parse(island.fileName).name,
          preserveSignature: "exports-only",
        });
      }
    },
    generateBundle(options, bundle) {
      if (this.environment.config.consumer !== "client") return;
      for (const file of Object.values(bundle)) {
        if (hasHash(file, options, islands)) hashed.add(file.fileName);
      }
    },
  };
}

/**
 * Whether Rolldown named an output file with its content hash: by a
 * pattern with `[hash]`, e.g. Vite's `assets/[name]-[hash].js`, that
 * matches the file's name. Entries are named by `entryFileNames`, other
 * chunks by `chunkFileNames`, and so are the chunks in `emitted`, which
 * a plugin emitted, like the islands: Rolldown names them by
 * `chunkFileNames` although they're entries. Assets are named by
 * `assetFileNames`. A file named otherwise, e.g. by a pattern like
 * `[name].js` or by the plugin that emitted it, keeps its name when its
 * content changes.
 */
export function hasHash(
  file: Rolldown.OutputChunk | Rolldown.OutputAsset,
  options: Pick<
    Rolldown.NormalizedOutputOptions,
    "entryFileNames" | "chunkFileNames" | "assetFileNames"
  >,
  emitted: ReadonlySet<string> = new Set(),
): boolean {
  let pattern: string;
  if (file.type === "asset") {
    pattern =
      typeof options.assetFileNames === "function"
        ? options.assetFileNames({
            type: "asset",
            name: file.name,
            names: file.names,
            originalFileName: file.originalFileName ?? undefined,
            originalFileNames: file.originalFileNames,
            source: file.source,
          })
        : options.assetFileNames;
  } else {
    const entry = file.isEntry && !(file.facadeModuleId && emitted.has(file.facadeModuleId));
    const names = entry ? options.entryFileNames : options.chunkFileNames;
    pattern = typeof names === "function" ? names(file) : names;
  }
  return fileNamePattern(pattern)?.test(file.fileName) ?? false;
}

// Rolldown's `[hash]` has 8 characters, `[hash:12]` 12.
const HASH_LENGTH = 8;

const PLACEHOLDERS: Record<string, string> = {
  name: ".+",
  ext: "[^/]+",
  extname: "(?:\\.[^/]+)?",
  format: "[^/]+",
};

// A regular expression for the file names a pattern with `[hash]` gives.
function fileNamePattern(pattern: string): RegExp | undefined {
  if (!/\[hash(?::\d+)?\]/.test(pattern)) return undefined;
  const source = pattern
    .split(/(\[\w+(?::\d+)?\])/)
    .map((part) => {
      const [, placeholder, length] = /^\[(\w+)(?::(\d+))?\]$/.exec(part) ?? [];
      if (placeholder === "hash") return `[\\w-]{${length ?? HASH_LENGTH}}`;
      return (
        (placeholder && PLACEHOLDERS[placeholder]) ?? part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );
    })
    .join("");
  return new RegExp(`^${source}$`);
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
