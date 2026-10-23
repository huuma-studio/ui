// Checks the native npm build from `vp pack` (spec #126, D7): every deno.json
// export has its JavaScript and declaration file in dist/ and loads in Node,
// and every file a module opens by `new URL(..., import.meta.url)` exists.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";

const jsr = JSON.parse(readFileSync("deno.json", "utf8")) as {
  exports: Record<string, string>;
};

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

// Forward slashes on every OS (readdirSync returns backslashes on
// Windows); Node opens them on Windows too.
const files = readdirSync("dist", { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".js"))
  .map((file) => `dist/${file.split(sep).join("/")}`);
const fileUrl = /new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;
for (const file of files) {
  for (const [, target] of readFileSync(file, "utf8").matchAll(fileUrl)) {
    if (!existsSync(join(dirname(file), target))) {
      failures.push(`${file} -> ${target}: the file is missing`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`dist/ has all ${Object.keys(jsr.exports).length} deno.json exports.`);
