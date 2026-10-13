// The Deno pipeline renders the basic fixture like the Vite build: both match
// `test/snapshots/basic.txt` (the Vite side is in `src/vite/build.test.ts`).
// Remove it with the pipeline (spec #126, Phase 6); the snapshot stays.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { repoRoot, writeDenoConfig } from "./config.ts";

/** Replaces `from` in a file, which must contain it. */
async function rewrite(path: string, from: string, to: string) {
  const code = await readFile(path, "utf8");
  assert.ok(code.includes(from), `${path} doesn't contain ${from}`);
  await writeFile(path, code.replace(from, to));
}

Deno.test("the Deno pipeline renders the basic fixture like the Vite build", async () => {
  const dir = await mkdtemp(join(tmpdir(), "huuma-rendered-"));
  try {
    await cp(join(repoRoot, "test/fixtures/basic"), dir, { recursive: true });
    await writeDenoConfig(dir);
    // What the Deno pipeline can't read, written the way it can: it has no
    // `import.meta.env`, and finds remote functions with a regex that only
    // knows function declarations.
    await rewrite(
      join(dir, "components/greeting.client.tsx"),
      "{env.PUBLIC_GREETING}",
      '{Deno.env.get("PUBLIC_GREETING")}',
    );
    await rewrite(
      join(dir, "app/sum.remote.ts"),
      "export const add: (a: number, b: number) => Promise<number> = async (a, b) => a + b;",
      "export async function add(a: number, b: number): Promise<number> {\n  return a + b;\n}",
    );

    // Its own program, since Deno resolves the app's imports with the
    // `deno.json` it starts with (found next to the script, without
    // `--config`). `--env-file` loads what Vite loads.
    const { code, stderr } = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-all",
        "--no-check",
        "--node-modules-dir=none",
        "--config=deno.json",
        // Like the CI job that runs this test.
        "--minimum-dependency-age=0",
        "--env-file=.env",
        join(repoRoot, "test/deno/render-fixture.ts"),
      ],
      cwd: dir,
      stdout: "null",
    }).output();
    assert.equal(code, 0, new TextDecoder().decode(stderr));

    assert.equal(
      await readFile(join(dir, "rendered.txt"), "utf8"),
      await readFile(join(repoRoot, "test/snapshots/basic.txt"), "utf8"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
