import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { assetsDirectory, immutableHeaders, immutablePaths, writeWorkersFiles } from "./workers.ts";

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

describe(assetsDirectory.name, () => {
  const dist = ["", "app", "dist", "client"].join(sep);

  test("is the build's directory at the base /", () => {
    expect(assetsDirectory(dist, "/")).toStrictEqual(dist);
  });

  test("is the build's directory without the base", () => {
    expect(assetsDirectory(join(dist, "shop"), "/shop/")).toStrictEqual(dist);
    expect(assetsDirectory(join(dist, "a", "b"), "https://cdn.example/a/b/")).toStrictEqual(dist);
  });

  test("is the build's directory when it doesn't end with the base", () => {
    expect(assetsDirectory(dist, "/shop/")).toStrictEqual(dist);
    expect(assetsDirectory(join(dist, "workshop"), "/shop/")).toStrictEqual(join(dist, "workshop"));
  });
});

describe(writeWorkersFiles.name, () => {
  let root: string;
  let assetsDir: string;
  let outDir: string;
  let publicDir: string;
  const warnings: string[] = [];
  const write = (hashed: string[]) =>
    writeWorkersFiles({
      assetsDir,
      outDir,
      publicDir,
      hashed: new Set(hashed),
      warn: (message) => warnings.push(message),
    });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "huuma-workers-"));
    assetsDir = outDir = join(root, "dist/client");
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

  test("counts the public dir's rules too", async () => {
    const own = Array.from({ length: 100 }, (_, i) => `# rule ${i}\n/page-${i}\n  X-Rule: ${i}`);
    await writeFile(join(publicDir, "_headers"), own.join("\n"));
    await write(["assets/a-1234abcd.js"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("would have 101 rules (1 for hashed files)");
  });

  test("doesn't warn about the public dir's rules alone", async () => {
    const own = Array.from({ length: 101 }, (_, i) => `/page-${i}\n  X-Rule: ${i}`);
    await writeFile(join(publicDir, "_headers"), own.join("\n"));
    await write([]);
    expect(warnings).toStrictEqual([]);
  });

  test("warns when Cloudflare would drop rules", async () => {
    const hashed = Array.from({ length: 101 }, (_, i) => `chunk-${i}.js`);
    for (const file of [...hashed, "robots.txt"]) await writeFile(join(outDir, file), "");
    await write(hashed);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("would have 101 rules (101 for hashed files)");
  });

  describe("below a base", () => {
    beforeEach(async () => {
      // The build at the base /shop/: Vite copied the public dir's files to it.
      assetsDir = outDir;
      outDir = join(assetsDir, "shop");
      await mkdir(join(outDir, "assets"), { recursive: true });
      await writeFile(join(outDir, "assets/a-1234abcd.js"), "");
      await writeFile(join(publicDir, "_headers"), "/shop/*\n  X-Frame-Options: DENY\n");
      await writeFile(join(outDir, "_headers"), "/shop/*\n  X-Frame-Options: DENY\n");
    });

    test("writes the files where Workers reads them, with the rules below the base", async () => {
      await write(["assets/a-1234abcd.js"]);
      expect(await readFile(join(assetsDir, "_headers"), "utf8")).toStrictEqual(
        `/shop/*\n  X-Frame-Options: DENY\n\n${immutableHeaders(["/shop/assets/*"])}`,
      );
      expect(await readFile(join(assetsDir, ".assetsignore"), "utf8")).toContain(".vite\n");
    });

    test("names the base in the rules as in URLs, encoded", async () => {
      // The directory of the base `/sale%25/`.
      const sale = join(assetsDir, "sale%");
      await mkdir(join(sale, "assets"), { recursive: true });
      await writeFile(join(sale, "assets/a-1234abcd.js"), "");
      await writeWorkersFiles({
        assetsDir,
        outDir: sale,
        publicDir: "",
        hashed: new Set(["assets/a-1234abcd.js"]),
        warn: (message) => warnings.push(message),
      });
      expect(await readFile(join(assetsDir, "_headers"), "utf8")).toStrictEqual(
        immutableHeaders(["/sale%25/assets/*"]),
      );
    });

    test("removes the public dir's copies, which Workers would serve", async () => {
      await write(["assets/a-1234abcd.js"]);
      expect(await readdir(outDir)).not.toContain("_headers");
    });
  });
});
