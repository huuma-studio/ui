// The size of the browser runtime every page with islands loads: what the
// islands plugin imports (`export { launch } from "@huuma/ui/browser"`, see
// src/vite/islands.ts), bundled like an app's production build.
import { describe, expect, test } from "vite-plus/test";
import { build, type Rolldown } from "vite";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// Bytes. Raise a budget on purpose, in the commit that needs it, and lower
// it when the runtime shrinks so the headroom stays small (~2.5%).
const BUDGET = { minified: 33_000, gzipped: 9_000 };

const runtime = fileURLToPath(new URL("../src/platform/browser/mod.ts", import.meta.url));

async function bundle(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "huuma-size-"));
  try {
    const entry = join(dir, "entry.ts");
    await writeFile(entry, `export { launch } from ${JSON.stringify(runtime)};\n`);
    const result = await build({
      configFile: false,
      logLevel: "silent",
      // As in an app's build: development-only code can drop out.
      define: { "process.env.NODE_ENV": '"production"' },
      build: {
        write: false,
        minify: true,
        lib: { entry, formats: ["es"], fileName: "runtime" },
        rolldownOptions: { output: { codeSplitting: false } },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[];
    const chunks = outputs.flatMap(({ output }) => output).filter((file) => file.type === "chunk");
    expect(chunks).toHaveLength(1);
    return chunks[0].code;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("browser runtime size", () => {
  test("stays within its budget, minified and gzipped", async () => {
    const code = await bundle();
    const size = {
      minified: Buffer.byteLength(code),
      gzipped: gzipSync(code, { level: 9 }).byteLength,
    };
    expect(
      size.minified <= BUDGET.minified && size.gzipped <= BUDGET.gzipped,
      `runtime is ${size.minified} B minified, ${size.gzipped} B gzipped; ` +
        `budget ${BUDGET.minified} B and ${BUDGET.gzipped} B (test/size.test.ts)`,
    ).toBe(true);
  }, 60_000);
});
