import { describe, expect, test } from "vite-plus/test";
import { readFileSync } from "node:fs";

// deno.json is the JSR manifest; package.json drives the Node tooling. JSR
// publish resolves bare specifiers through package.json but rejects `jsr:`
// there, so JSR dependencies are listed twice: as `jsr:` in the deno.json
// import map (published as real JSR dependencies) and as `npm:@jsr/...`
// aliases in package.json (installed by pnpm).
const read = (file: string) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const deno = read("deno.json");
const pkg = read("package.json");

describe("manifests", () => {
  test("export the same entry points", () => {
    expect(pkg.exports).toStrictEqual(deno.exports);
  });

  test("declare the same JSR dependencies", () => {
    const fromDeno = Object.fromEntries(
      Object.entries(deno.imports as Record<string, string>).map(([name, specifier]) => [
        name,
        specifier.replace(/^jsr:@([^/]+)\/([^@]+)@/, "npm:@jsr/$1__$2@"),
      ]),
    );
    const fromPackage = Object.fromEntries(
      Object.entries(pkg.dependencies as Record<string, string>).filter(([, version]) =>
        version.startsWith("npm:@jsr/"),
      ),
    );
    expect(fromPackage).toStrictEqual(fromDeno);
  });
});
