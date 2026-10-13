import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot: string = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Writes a `deno.json` that resolves "@huuma/ui" to this repository, so the
 * fixture app and the bundled browser runtime use the code under test.
 */
export async function writeDenoConfig(dir: string): Promise<void> {
  const config = JSON.parse(await readFile(join(repoRoot, "jsr.json"), "utf8"));
  const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const imports: Record<string, string> = {
    ...config.imports,
    // For an app outside this repository, which has no package.json.
    esbuild: `npm:esbuild@${pkg.dependencies.esbuild}`,
  };
  for (const [path, file] of Object.entries<string>(config.exports)) {
    imports[`@huuma/ui${path.slice(1)}`] = join(repoRoot, file);
  }
  await writeFile(
    join(dir, "deno.json"),
    JSON.stringify({
      imports,
      compilerOptions: { jsx: "react-jsx", jsxImportSource: "@huuma/ui" },
    }),
  );
}
