// Deno-only smoke test of the current build pipeline (pack/list), which
// bundles through @deno/esbuild-plugin and therefore needs the Deno runtime.
// Runs with `deno test` in CI, outside Vitest. Remove it once the Vite
// plugin replaces the pipeline (spec #126, Phase 6).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createUIApp } from "../../src/platform/server/app.ts";
import { jsx } from "../../src/jsx-runtime/mod.ts";
import { list } from "../../src/platform/server/pack/list/mod.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Runs `fn` with a fresh temporary directory as the working directory. */
async function inTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "huuma-pack-"));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await fn(dir);
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
}

Deno.test({
  name: `${list.name}: bundles the app and registers the live reload route`,
  // esbuild keeps its service process alive across builds.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const config = JSON.parse(await readFile(join(repoRoot, "deno.json"), "utf8"));

    await inTempDir(async (dir) => {
      // Resolve "@huuma/ui" to this repository so the fixture app and the
      // bundled browser runtime use the code under test.
      await writeFile(
        join(dir, "deno.json"),
        JSON.stringify({
          imports: {
            ...config.imports,
            "@huuma/ui/jsx-runtime": join(repoRoot, "src/jsx-runtime/mod.ts"),
            "@huuma/ui/server/pack": join(repoRoot, "src/platform/server/pack/mod.ts"),
          },
          compilerOptions: { jsx: "react-jsx", jsxImportSource: "@huuma/ui" },
        }),
      );
      await mkdir(join(dir, "app"));
      await writeFile(
        join(dir, "app", "page.tsx"),
        'export default function Page() { return "Hello"; }',
      );

      const app = createUIApp(({ children }) =>
        jsx("html", { children: [jsx("body", { children: [children] })] }),
      );
      await list(app, { isProd: false });
      const handle = app.deliver();
      const connection = { remoteAddr: { transport: "tcp" } };

      // Without the upgrade header the route answers 400; an unregistered
      // route would answer 404.
      const websocket = await handle(new Request("http://localhost/_websocket"), connection);
      await websocket.body?.cancel();
      assert.equal(websocket.status, 400);

      const page = await handle(new Request("http://localhost/"), connection);
      assert.equal(page.status, 200);
      assert.equal((await page.text()).includes("Hello"), true);

      assert.equal(await exists(join(dir, ".huuma", "list.ts")), true);
      assert.equal(await exists(join(dir, ".huuma", "scripts", "huuma_ui_launch.js")), true);
      // The env shim is only needed while bundling.
      assert.equal(await exists(join(dir, ".huuma", "shims")), false);
    });
  },
});
