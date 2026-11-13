import { describe, expect, test } from "vite-plus/test";
import { readdirSync, readFileSync } from "node:fs";
import { sep } from "node:path";
import { parseSync } from "vite";

// jsr.json is the JSR manifest; package.json drives the Node tooling and is
// the only place that lists dependencies. `deno publish` reads them from
// there and rewrites each bare import of the published files to what
// package.json says: `"vite"` to `"npm:vite@^8"`, `"@huuma/route"` to
// `"jsr:@huuma/route@^0.3.1"`.
const root = new URL("../", import.meta.url);
const read = (file: string) => JSON.parse(readFileSync(new URL(file, root), "utf8"));
const jsr = read("jsr.json");
const pkg = read("package.json");

// The versions `deno publish` can rewrite an import to: a range, alone or
// after `jsr:` or `npm:<name>@`. Not pnpm's `catalog:` or `workspace:`.
const PUBLISHABLE = /^(?:jsr:|npm:@?[^@]+@)?[\^~]?\d[\w.+-]*$/;

// What jsr.json publishes of src/: everything but the tests.
function publishedFiles(): string[] {
  return readdirSync(new URL("src", root), { recursive: true, encoding: "utf8" })
    .map((file) => `src/${file.split(sep).join("/")}`)
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
}

// The packages `file` imports: from its imports, its re-exports and its
// `import("name")` calls (other dynamic imports aren't rewritten anyway).
function importedPackages(file: string): string[] {
  const code = readFileSync(new URL(file, root), "utf8");
  const { module } = parseSync(file, code);
  const specifiers = [
    ...module.staticImports.map((entry) => entry.moduleRequest.value),
    ...module.staticExports.flatMap(({ entries }) =>
      entries.flatMap((entry) => (entry.moduleRequest ? [entry.moduleRequest.value] : [])),
    ),
    ...module.dynamicImports.flatMap(({ moduleRequest }) => {
      const literal = /^(["'])([^"'`$]+)\1$/.exec(
        code.slice(moduleRequest.start, moduleRequest.end),
      );
      return literal ? [literal[2]] : [];
    }),
  ];
  return (
    specifiers
      // Not relative files, nor specifiers that say where they're from.
      .filter((specifier) => !/^(\.{0,2}\/|node:|jsr:|npm:|https?:)/.test(specifier))
      .map((specifier) =>
        specifier
          .split("/")
          .slice(0, specifier.startsWith("@") ? 2 : 1)
          .join("/"),
      )
  );
}

describe("manifests", () => {
  test("export the same entry points", () => {
    expect(pkg.exports).toStrictEqual(jsr.exports);
  });

  test("leave the dependencies to package.json", () => {
    // An import map in jsr.json would win over package.json, and the two
    // would have to be kept the same.
    expect(jsr.imports).toBeUndefined();
  });

  // `deno publish` rewrites an import it has no usable version for to a
  // relative path (`"vite"` to `"./vite"`), with the dry run still passing.
  // JSR then refuses the package while it generates its docs.
  test("declare every package the published files import with a version JSR understands", () => {
    const versions: Record<string, string> = { ...pkg.devDependencies, ...pkg.dependencies };
    const files = publishedFiles();
    expect(files.length).toBeGreaterThan(0);

    const imported = [...new Set(files.flatMap(importedPackages))].sort();
    expect(imported).toContain("vite");

    const unpublishable = imported.filter((name) => !PUBLISHABLE.test(versions[name] ?? ""));
    expect(unpublishable).toStrictEqual([]);
  });
});
