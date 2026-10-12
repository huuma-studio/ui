// Checks the native npm build from `vp pack` (spec #126, D7): every jsr.json
// export has its JavaScript and declaration file in dist/ and loads in Node,
// and every file a module opens by `new URL(..., import.meta.url)` exists.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const jsr = JSON.parse(readFileSync("jsr.json", "utf8")) as {
  exports: Record<string, string>;
};

// Known gaps: the Deno build pipeline names its browser entries by their
// source path, so they only resolve from src/. It needs the Deno runtime
// (@deno/esbuild-plugin) and is replaced by the Vite plugin in Phases 4-6.
const DENO_ONLY = new Set([
  "dist/platform/server/pack/list/mod.js -> ../../../browser/mod.ts",
  "dist/platform/server/pack/list/mod.js -> ../../../browser/live-reload.ts",
]);

const failures: string[] = [];
for (const [name, source] of Object.entries(jsr.exports)) {
  const base = source.replace(/^\.\/src\//, "dist/").replace(/\.ts$/, "");
  for (const file of [`${base}.js`, `${base}.d.ts`]) {
    if (!existsSync(file)) failures.push(`${name}: ${file} is missing`);
  }
  try {
    await import(pathToFileURL(`${base}.js`).href);
  } catch (error) {
    failures.push(`${name}: ${base}.js fails to load: ${String(error)}`);
  }
}

const files = readdirSync("dist", { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".js"))
  .map((file) => relative(".", join("dist", file)));
const fileUrl = /new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;
const unused = new Set(DENO_ONLY);
for (const file of files) {
  for (const [, target] of readFileSync(file, "utf8").matchAll(fileUrl)) {
    const reference = `${file} -> ${target}`;
    unused.delete(reference);
    if (!DENO_ONLY.has(reference) && !existsSync(join(dirname(file), target))) {
      failures.push(`${reference}: the file is missing`);
    }
  }
}
for (const reference of unused) {
  failures.push(`${reference}: no longer referenced, remove it from DENO_ONLY`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`dist/ has all ${Object.keys(jsr.exports).length} jsr.json exports.`);
