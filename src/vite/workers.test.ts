import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { immutableHeaders, immutablePaths, writeWorkersFiles } from "./workers.ts";

describe(immutablePaths.name, () => {
  test("covers a directory of hashed files with one rule", () => {
    const files = ["assets/a-1234abcd.js", "assets/b-1234abcd.css", ".vite/manifest.json"];
    expect(immutablePaths(files, new Set(files.slice(0, 2)))).toStrictEqual(["/assets/*"]);
  });

  test("lists hashed files next to unhashed ones one by one", () => {
    const files = ["assets/a-1234abcd.js", "assets/logo.svg", "b-1234abcd.js", "robots.txt"];
    const hashed = new Set(["assets/a-1234abcd.js", "b-1234abcd.js"]);
    expect(immutablePaths(files, hashed)).toStrictEqual([
      "/assets/a-1234abcd.js",
      "/b-1234abcd.js",
    ]);
  });

  test("is empty without hashed files", () => {
    expect(immutablePaths(["robots.txt"], new Set())).toStrictEqual([]);
  });
});

describe(immutableHeaders.name, () => {
  test("caches each path for good", () => {
    expect(immutableHeaders(["/assets/*", "/b-1234abcd.js"])).toStrictEqual(
      "# Added by @huuma/ui: files with a content hash in their name never change.\n" +
        "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n" +
        "/b-1234abcd.js\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
  });
});

describe(writeWorkersFiles.name, () => {
  let root: string;
  let outDir: string;
  let publicDir: string;
  const warnings: string[] = [];
  const write = (hashed: string[]) =>
    writeWorkersFiles({
      outDir,
      publicDir,
      hashed: new Set(hashed),
      warn: (message) => warnings.push(message),
    });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "huuma-workers-"));
    outDir = join(root, "dist/client");
    publicDir = join(root, "public");
    await mkdir(join(outDir, "assets"), { recursive: true });
    await mkdir(join(outDir, ".vite"));
    await mkdir(publicDir);
    await writeFile(join(outDir, "assets/a-1234abcd.js"), "");
    await writeFile(join(outDir, ".vite/manifest.json"), "{}");
    warnings.length = 0;
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("writes .assetsignore and _headers", async () => {
    await write(["assets/a-1234abcd.js"]);
    expect(await readFile(join(outDir, ".assetsignore"), "utf8")).toStrictEqual(
      "# Added by @huuma/ui: Vite's manifest.\n.vite\n",
    );
    expect(await readFile(join(outDir, "_headers"), "utf8")).toStrictEqual(
      immutableHeaders(["/assets/*"]),
    );
    expect(warnings).toStrictEqual([]);
  });

  test("adds to the files of the public dir", async () => {
    await writeFile(join(publicDir, "_headers"), "/*\n  X-Frame-Options: DENY\n");
    await writeFile(join(publicDir, ".assetsignore"), "drafts\n");
    await write(["assets/a-1234abcd.js"]);
    expect(await readFile(join(outDir, "_headers"), "utf8")).toStrictEqual(
      `/*\n  X-Frame-Options: DENY\n\n${immutableHeaders(["/assets/*"])}`,
    );
    expect(await readFile(join(outDir, ".assetsignore"), "utf8")).toStrictEqual(
      "drafts\n\n# Added by @huuma/ui: Vite's manifest.\n.vite\n",
    );
  });

  test("writes no _headers without hashed files", async () => {
    await write([]);
    expect(await readdir(outDir)).not.toContain("_headers");
  });

  test("works without a public dir", async () => {
    publicDir = "";
    await write(["assets/a-1234abcd.js"]);
    expect(await readdir(outDir)).toContain("_headers");
  });

  test("warns when Cloudflare would drop rules", async () => {
    const hashed = Array.from({ length: 101 }, (_, i) => `chunk-${i}.js`);
    for (const file of [...hashed, "robots.txt"]) await writeFile(join(outDir, file), "");
    await write(hashed);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Cloudflare applies only 100");
  });
});
