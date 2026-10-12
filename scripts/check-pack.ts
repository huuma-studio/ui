// Checks the native npm build from `vp pack` (spec #126, D7): every jsr.json
// export has its JavaScript and declaration file in dist/, and loads in Node.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const jsr = JSON.parse(readFileSync("jsr.json", "utf8")) as {
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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`dist/ has all ${Object.keys(jsr.exports).length} jsr.json exports.`);
