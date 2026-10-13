import type { Manifest, ResolvedConfig } from "vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * What the server build needs from the client build: the browser paths
 * (without the leading `/`, after `base`) of the runtime and the islands.
 */
export interface ClientBuild {
  runtime: string;
  /** Island paths by the island's absolute source file. */
  islands: Map<string, string>;
}

// The client build's input name for `virtual:huuma/runtime` (see
// `buildPlugin()`). Islands are named after their files, `*.client`.
export const RUNTIME_INPUT = "runtime";

const builds = new WeakMap<ResolvedConfig, Promise<ClientBuild>>();

/**
 * Reads the client build's manifest, once per build. The client builds
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
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(file, "utf8")) as Manifest;
  } catch (error) {
    throw new Error(
      `Huuma's server build needs the client build's manifest (${file}): ` +
        `${error instanceof Error ? error.message : String(error)}. Build both with \`vite build\`.`,
    );
  }

  const chunks = Object.values(manifest).filter((chunk) => chunk.isEntry);
  const runtime = chunks.find((chunk) => chunk.name === RUNTIME_INPUT);
  if (!runtime) throw new Error(`The client build's manifest (${file}) has no runtime.`);

  const islands = new Map<string, string>();
  for (const chunk of chunks) {
    if (chunk !== runtime && chunk.src) {
      islands.set(resolve(config.root, chunk.src), builtPath(config.base, chunk.file));
    }
  }
  return { runtime: builtPath(config.base, runtime.file), islands };
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
