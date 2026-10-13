// Deno-only smoke test of the current build pipeline (pack/list), which
// bundles through @deno/esbuild-plugin and therefore needs the Deno runtime.
// Runs with `deno test` in CI, outside Vitest. Remove it once the Vite
// plugin replaces the pipeline (spec #126, Phase 6).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { createUIApp } from "../../src/platform/server/app.ts";
import { jsx } from "../../src/jsx-runtime/mod.ts";
import { list } from "../../src/platform/server/pack/list/mod.ts";
import { writeDenoConfig } from "./config.ts";

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

/**
 * Resolves "@huuma/ui" to this repository, so the fixture app and the
 * bundled browser runtime use the code under test.
 */

Deno.test({
  name: `${list.name}: bundles the app and registers the live reload route`,
  // esbuild keeps its service process alive across builds.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await inTempDir(async (dir) => {
      await writeDenoConfig(dir);
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

Deno.test({
  name: `${list.name}: stubs remote functions in the browser and serves them`,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await inTempDir(async (dir) => {
      await writeDenoConfig(dir);
      await mkdir(join(dir, "app"));
      await writeFile(join(dir, "app", "page.tsx"), "export default () => null;");
      await writeFile(
        join(dir, "app", "todo.remote.ts"),
        [
          'import { readFile } from "node:fs/promises";',
          "export async function add(a: number, b: number) { return a + b; }",
          "export default async function reset() {}",
        ].join("\n"),
      );
      await writeFile(
        join(dir, "app", "counter.client.tsx"),
        [
          'import reset, { add } from "./todo.remote.ts";',
          "export default function Counter() { add(1, 2); reset(); return null; }",
        ].join("\n"),
      );

      const app = createUIApp(({ children }) => jsx("html", { children: [children] }));
      await list(app, { isProd: false, enableLiveReload: false });
      const handle = app.deliver();
      const connection = { remoteAddr: { transport: "tcp" } };

      // The island's bundle calls the endpoint instead of the server code.
      const scripts = join(dir, ".huuma", "scripts");
      const island = (await Array.fromAsync(Deno.readDir(scripts))).find((entry) =>
        entry.name.endsWith("-counter.client.js"),
      );
      assert.ok(island);
      const bundle = await readFile(join(scripts, island.name), "utf8");
      const endpoint = /"(\/_huuma\/remote\/[0-9a-f]{8}\/todo\.remote)"/.exec(bundle)?.[1];
      assert.ok(endpoint);
      assert.equal(bundle.includes("node:fs"), false);

      const call = (remoteFunction: string, args: unknown[]) =>
        handle(
          new Request(`http://localhost${endpoint}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ remoteFunction, args }),
          }),
          connection,
        );
      const sum = await call("add", [1, 2]);
      assert.equal(sum.status, 200);
      assert.equal(await sum.json(), 3);
      const reset = await call("default", []);
      assert.equal(reset.status, 204);
    });
  },
});
