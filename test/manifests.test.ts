import { describe, expect, test } from "vite-plus/test";
import { readFileSync } from "node:fs";

// deno.json is the JSR manifest, and the root of a Deno workspace for the
// other packages this repo publishes; package.json drives the Node
// tooling. JSR publish resolves bare specifiers through package.json but
// rejects `jsr:` there, so JSR dependencies are listed twice: as `jsr:` in
// the deno.json import map (published as real JSR dependencies) and as
// `npm:@jsr/...` aliases in package.json (installed by pnpm).
const read = (file: string) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const jsr = read("deno.json");
const pkg = read("package.json");
// @huuma/ui-cloudflare, a member of the workspace, released with the core.
const cloudflare = {
  jsr: read("packages/ui-cloudflare/deno.json"),
  pkg: read("packages/ui-cloudflare/package.json"),
};

describe("manifests", () => {
  test("don't share the package's name", () => {
    // Deno would resolve another package's `@huuma/ui` imports to the
    // local package.json then, and publish them as `npm:@huuma/ui`. The
    // tests reach the package through its `link:.` dev dependency.
    expect(jsr.name).toStrictEqual("@huuma/ui");
    expect(pkg.name).not.toStrictEqual(jsr.name);
    expect(pkg.devDependencies["@huuma/ui"]).toStrictEqual("link:.");
  });

  test("export the same entry points", () => {
    expect(pkg.exports).toStrictEqual(jsr.exports);
  });

  test("declare the same JSR dependencies", () => {
    const fromJsr = Object.fromEntries(
      Object.entries(jsr.imports as Record<string, string>).map(([name, specifier]) => [
        name,
        specifier.replace(/^jsr:@([^/]+)\/([^@]+)@/, "npm:@jsr/$1__$2@"),
      ]),
    );
    const fromPackage = Object.fromEntries(
      Object.entries(pkg.dependencies as Record<string, string>).filter(([, version]) =>
        version.startsWith("npm:@jsr/"),
      ),
    );
    expect(fromPackage).toStrictEqual(fromJsr);
  });
});

describe("@huuma/ui-cloudflare's manifests", () => {
  test("are a member of the workspace", () => {
    expect(jsr.workspace).toContain("./packages/ui-cloudflare");
    expect(pkg.devDependencies[cloudflare.jsr.name]).toStrictEqual("workspace:*");
  });

  test("have the core's version, and import the core at it", () => {
    // Released together: the pre-release workflow reads the root's version.
    expect(cloudflare.jsr.version).toStrictEqual(jsr.version);
    expect(cloudflare.jsr.imports["@huuma/ui"]).toStrictEqual(`jsr:@huuma/ui@^${jsr.version}`);
  });

  test("export the same entry points", () => {
    expect(cloudflare.pkg.exports).toStrictEqual(cloudflare.jsr.exports);
  });

  test("declare the same npm dependencies, and the core's Vite", () => {
    for (const [name, version] of Object.entries(
      cloudflare.pkg.dependencies as Record<string, string>,
    )) {
      expect(cloudflare.jsr.imports[name], name).toStrictEqual(`npm:${name}@${version}`);
    }
    expect(cloudflare.jsr.imports.vite).toStrictEqual(`npm:vite@${pkg.devDependencies.vite}`);
  });
});
