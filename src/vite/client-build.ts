import type { Manifest, ResolvedConfig } from "vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * What the server build needs from the client build: the browser paths
 * (without the leading `/`, after `base`) of the runtime and the islands,
 * and which files have a content hash in their name.
 */
export interface ClientBuild {
  runtime: string;
  /** Island paths by the island's absolute source file. */
  islands: Map<string, string>;
  /** The client build's files with a hash in their name, e.g. `assets/x-3f2a.js`. */
  hashed: string[];
}

/**
 * The file in the client build, next to Vite's manifest, where the build
 * plugin writes what the manifest doesn't say: `{ hashed }`.
 */
export const CLIENT_BUILD_FILE = ".vite/huuma.json";

// The client build's input name for `virtual:huuma/runtime` (see
// `buildPlugin()`). Islands are named after their files, `*.client`.
export const RUNTIME_INPUT = "runtime";

const builds = new WeakMap<ResolvedConfig, Promise<ClientBuild>>();

/**
 * Reads the client build's manifest and `CLIENT_BUILD_FILE`, once per build. The client builds
 * first (`buildApp`), so it's there when the server build needs it.
 */
export function readClientBuild(config: ResolvedConfig): Promise<ClientBuild> {
  let build = builds.get(config);
  if (!build) {
    build = load(config);
    builds.set(config, build);
  }
  return build;
}

async function load(config: ResolvedConfig): Promise<ClientBuild> {
  const outDir = resolve(config.root, config.environments.client.build.outDir);
  const file = resolve(outDir, ".vite/manifest.json");
  const manifest = await readJson<Manifest>(file, "manifest");
  const { hashed } = await readJson<{ hashed: string[] }>(
    resolve(outDir, CLIENT_BUILD_FILE),
    "list of hashed files",
  );

  const chunks = Object.values(manifest).filter((chunk) => chunk.isEntry);
  const runtime = chunks.find((chunk) => chunk.name === RUNTIME_INPUT);
  if (!runtime) throw new Error(`The client build's manifest (${file}) has no runtime.`);

  const islands = new Map<string, string>();
  for (const chunk of chunks) {
    if (chunk !== runtime && chunk.src) {
      islands.set(resolve(config.root, chunk.src), builtPath(config.base, chunk.file));
    }
  }
  return { runtime: builtPath(config.base, runtime.file), islands, hashed };
}

async function readJson<T>(file: string, what: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `Huuma's server build needs the client build's ${what} (${file}): ` +
        `${error instanceof Error ? error.message : String(error)}. Build both with \`vite build\`.`,
    );
  }
}

/**
 * The browser path of a built file, e.g. `assets/counter.client-3f2a.js`
 * after `base`. Each segment is URL-encoded, like the dev server's paths.
 * A URL `base` (a CDN) makes it a URL, which the page loads as it is; a
 * relative one (`./`) is `/`, as the app lives there (see `appBase()`).
 */
export function builtPath(base: string, file: string): string {
  const segments = file.split("/").map(encodeURIComponent);
  const prefix = base === "" || base === "./" ? "/" : base;
  return (prefix + segments.join("/")).replace(/^\/(?!\/)/, "");
}
