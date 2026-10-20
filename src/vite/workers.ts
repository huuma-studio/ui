/*
 * Files for Cloudflare Workers' static assets, which serve `dist/client`
 * before the Worker runs: `.assetsignore` and `_headers`. Wrangler reads
 * both and uploads neither. They do for Workers what `server.js` does on
 * Node: keep `.vite/` private and cache the hashed files for good.
 */
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { baseDirectory } from "./base.ts";

// The Cache-Control header `server.js` sends for hashed files.
const IMMUTABLE = "public, max-age=31536000, immutable";

// Cloudflare applies at most 100 rules from `_headers`.
const MAX_RULES = 100;

/**
 * The paths of `_headers` rules for the hashed files, given all files of
 * the client build (relative, with `/`). A top-level directory whose files
 * all have a hash, like Vite's `assets/`, is one rule (`/assets/*`).
 * Elsewhere, e.g. next to a public file without a hash, each hashed file
 * gets its own rule.
 */
export function immutablePaths(files: readonly string[], hashed: ReadonlySet<string>): string[] {
  const paths = new Set<string>();
  for (const file of [...hashed].sort()) {
    const slash = file.indexOf("/");
    const directory = slash === -1 ? undefined : file.slice(0, slash + 1);
    if (directory && files.every((other) => !other.startsWith(directory) || hashed.has(other))) {
      paths.add(`/${directory}*`);
    } else {
      paths.add(`/${file}`);
    }
  }
  return [...paths];
}

/** The `_headers` rules that cache `paths` for good. */
export function immutableHeaders(paths: readonly string[]): string {
  return [
    "# Added by @huuma/ui: files with a content hash in their name never change.",
    ...paths.map((path) => `${path}\n  Cache-Control: ${IMMUTABLE}`),
    "",
  ].join("\n");
}

/**
 * The directory Workers serves at `/`: the client build's `outDir`
 * without the base, e.g. `dist/client` for `dist/client/shop` at the base
 * `/shop/`. That's `outDir` itself when it doesn't end with the base.
 */
export function assetsDirectory(outDir: string, base: string): string {
  const directory = baseDirectory(base).split("/").join(sep);
  return directory && outDir.endsWith(sep + directory)
    ? outDir.slice(0, -(directory.length + 1))
    : outDir;
}

/**
 * Writes `.assetsignore` and `_headers` to `assetsDir`, for the client
 * build in `outDir`, which is `assetsDir` or a directory in it. Files of
 * the same name in `publicDir` are kept, and the rules are added to them.
 * Vite copied them to `outDir`; when that's below `assetsDir`, the copies
 * are removed, since Workers would serve them as files.
 */
export async function writeWorkersFiles(options: {
  assetsDir: string;
  outDir: string;
  /** Vite's resolved `publicDir`: `""` without one. */
  publicDir: string;
  /** The client build's files with a content hash in their name, relative to `outDir`. */
  hashed: ReadonlySet<string>;
  warn: (message: string) => void;
}): Promise<void> {
  const { assetsDir, outDir, publicDir, hashed } = options;
  const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));

  // The rules' paths start at `assetsDir`: `/shop/assets/*` for `/assets/*` in `dist/client/shop`.
  const below = relative(assetsDir, outDir).replaceAll("\\", "/");
  const paths = immutablePaths(files, hashed).map((path) => (below ? `/${below}${path}` : path));
  const ownHeaders = await readPublic("_headers");
  const rules = ruleCount(ownHeaders) + paths.length;
  if (paths.length && rules > MAX_RULES) {
    options.warn(
      `_headers would have ${rules} rules (${paths.length} for hashed files), but ` +
        `Cloudflare applies only ${MAX_RULES}. Keep hashed files in a directory of ` +
        "their own, like Vite's assets/, so one rule covers them, or use fewer rules " +
        "in public/_headers.",
    );
  }
  await write("_headers", ownHeaders, paths.length ? immutableHeaders(paths) : "");
  // Vite's manifest, which `server.js` doesn't serve either.
  await write(
    ".assetsignore",
    await readPublic(".assetsignore"),
    "# Added by @huuma/ui: Vite's manifest.\n.vite\n",
  );

  // A file of the public dir, which Vite copied to `outDir`; "" if none.
  async function readPublic(name: string): Promise<string> {
    if (!publicDir) return "";
    try {
      return await readFile(join(publicDir, name), "utf8");
    } catch {
      return "";
    }
  }

  async function write(name: string, own: string, content: string) {
    if (assetsDir !== outDir) await rm(join(outDir, name), { force: true });
    if (!own && !content) return;
    await writeFile(
      join(assetsDir, name),
      own && content ? `${own.trimEnd()}\n\n${content}` : own + content,
    );
  }
}

// The rules in a `_headers` file: each starts with an unindented URL
// pattern, followed by indented headers. `#` starts a comment.
function ruleCount(headers: string): number {
  return headers.split(/\r?\n/).filter((line) => /^[^\s#]/.test(line)).length;
}
