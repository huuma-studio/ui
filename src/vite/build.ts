import type { Environment, Plugin, Rolldown, UserConfig, ViteBuilder } from "vite";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import { listIslands } from "../platform/server/discover.ts";
import type { HuumaAdapter } from "./adapter.ts";
import { baseDirectory } from "./base.ts";
import { CLIENT_BUILD_FILE, readClientBuild, RUNTIME_INPUT } from "./client-build.ts";
import { SERVER_ID } from "./entry.ts";
import { RUNTIME_ID } from "./islands.ts";

// The files with a content hash in their name that a server build
// emitted, for `buildApp`, which builds that environment and moves the
// files to the client build.
const serverHashed = new WeakMap<Environment, Set<string>>();

/**
 * The production build (`vite build`): the client environment builds the
 * browser runtime and the islands into `dist/client`, with a manifest,
 * below the base's path: `dist/client/shop` at the base `/shop/`, so the
 * files' paths are their URLs' paths;
 * then the ssr environment builds the app into `dist/server`, reading the
 * client's manifest for the islands' browser paths: `app.js` exports the
 * app, and the adapter adds its entries, e.g. `server.js` for Node.
 */
export function buildPlugin(root: () => string, adapter: HuumaAdapter): Plugin {
  // The islands' files, which the client build emits as chunks.
  const islands = new Set<string>();
  return {
    name: "huuma:build",
    config(config) {
      const outDir = config.build?.outDir ?? "dist";
      return {
        // `vite build` builds every environment, through `buildApp`: the
        // config's, not a plugin hook, so it replaces another plugin's
        // default, e.g. @cloudflare/vite-plugin's, which would build them
        // all again, the server first.
        builder: { buildApp: (builder) => buildApp(builder, adapter) },
        environments: {
          client: {
            build: {
              outDir:
                config.environments?.client?.build?.outDir ??
                join(outDir, "client", baseDirectory(config.base ?? "/")),
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
              // Files the server code imports, e.g. an image a page shows:
              // `buildApp` moves them to the client build, which serves them.
              emitAssets: true,
              rolldownOptions: { input: { app: SERVER_ID } },
            },
          },
        },
      } satisfies UserConfig;
    },
    async buildStart() {
      if (this.environment.config.consumer !== "client" || this.environment.mode !== "build") {
        return;
      }
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
    // The files with a content hash in their name, which adapters cache for
    // good, e.g. `server.js`, go to a file next to Vite's manifest:
    // `vite build` with a config file gives each environment its own
    // instance of this plugin, so the server build can't share memory
    // with the client build.
    generateBundle(options, bundle) {
      if (this.environment.config.consumer !== "client") {
        // The server build's own, for `buildApp` in the same process.
        const assets = Object.values(bundle).filter((file) => file.type === "asset");
        serverHashed.set(
          this.environment,
          new Set(assets.filter((file) => hasHash(file, options)).map((file) => file.fileName)),
        );
        return;
      }
      const hashed = Object.values(bundle)
        .filter((file) => hasHash(file, options, islands))
        .map((file) => file.fileName)
        .sort();
      this.emitFile({
        type: "asset",
        fileName: CLIENT_BUILD_FILE,
        source: JSON.stringify({ hashed }),
      });
    },
  };
}

/**
 * Builds the app: the client first, since the server reads its manifest,
 * then the ssr environment, whose imported files then move to the client
 * build. The adapter's `beforeBuild` and `afterBuild` run around it, and
 * its plugins can shape the server build, e.g. @cloudflare/vite-plugin's
 * into a Worker.
 */
async function buildApp(builder: ViteBuilder, adapter: HuumaAdapter): Promise<void> {
  const client = builder.environments.client;
  const outDir = resolve(client.config.root, client.config.build.outDir);
  const { write } = client.config.build;
  if (write) await adapter.beforeBuild?.(builder);
  await builder.build(client);
  const ssr = builder.environments.ssr;
  const output = await builder.build(ssr);
  let moved: string[] = [];
  if (ssr.config.build.write) {
    moved = await moveServerAssets(
      resolve(ssr.config.root, ssr.config.build.outDir),
      outDir,
      importedAssets(output),
    );
    if (moved.length) {
      ssr.logger.info(`Moved ${moved.length} file(s) the server imports to the client build.`);
    }
  }
  if (write && adapter.afterBuild) {
    // The moved files have a hash when the server build named them with one.
    const hashed = new Set((await readClientBuild(builder.config)).hashed);
    for (const file of moved) if (serverHashed.get(ssr)?.has(file)) hashed.add(file);
    await adapter.afterBuild(builder, { hashed });
  }
}

/** The files the chunks of a build import, e.g. `assets/logo-a1b2c3d4.svg`. */
function importedAssets(output: Awaited<ReturnType<ViteBuilder["build"]>>): Set<string> {
  const files = new Set<string>();
  for (const result of Array.isArray(output) ? output : [output]) {
    // A watcher (`build.watch`) has no output yet.
    if (!("output" in result)) continue;
    for (const chunk of result.output) {
      if (chunk.type === "chunk")
        for (const file of chunk.viteMetadata?.importedAssets ?? []) files.add(file);
    }
  }
  return files;
}

/**
 * Moves `files`, which the server build emitted, from `serverDir` to the
 * client build in `clientDir`, at the same path: their URLs are the client
 * build's (Vite's `base` plus the path). A file the client build has
 * already, e.g. one an island imports too, is removed from the server
 * build. A different file at that path, e.g. from `public/` with unhashed
 * `assetFileNames`, is an error. Returns the paths moved.
 */
export async function moveServerAssets(
  serverDir: string,
  clientDir: string,
  files: Iterable<string>,
): Promise<string[]> {
  const moved: string[] = [];
  for (const file of files) {
    const from = join(serverDir, file);
    const to = join(clientDir, file);
    if (!(await exists(from))) continue;
    if (await exists(to)) {
      if (!(await readFile(from)).equals(await readFile(to))) {
        throw new Error(
          `The server code imports ${file}, but the client build has a different file ` +
            "at that path. Name the server build's assets with a hash, e.g. Vite's " +
            "default `assets/[name]-[hash][extname]`, or rename one of the files.",
        );
      }
      await rm(from, { force: true });
      continue;
    }
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    moved.push(file);
  }
  return moved;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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
