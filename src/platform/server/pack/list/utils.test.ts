import { describe, expect, test } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { generateHash, isNodeError, toCanonicalPath } from "./utils.ts";

describe(toCanonicalPath.name, () => {
  test("leaves an already-canonical path unchanged", () => {
    expect(toCanonicalPath("/src/test.remote.ts")).toStrictEqual("/src/test.remote.ts");
  });

  test("prepends a leading slash to relative POSIX paths", () => {
    expect(toCanonicalPath("src/test.remote.ts")).toStrictEqual("/src/test.remote.ts");
  });

  test("converts Windows backslashes to forward slashes", () => {
    expect(toCanonicalPath("src\\test.remote.ts")).toStrictEqual("/src/test.remote.ts");
    expect(toCanonicalPath("\\src\\test.remote.ts")).toStrictEqual("/src/test.remote.ts");
  });

  test("normalizes mixed separators", () => {
    expect(toCanonicalPath("src\\nested/test.remote.ts")).toStrictEqual("/src/nested/test.remote.ts");
  });

  test("collapses repeated leading slashes", () => {
    expect(toCanonicalPath("///src/test.remote.ts")).toStrictEqual("/src/test.remote.ts");
    expect(toCanonicalPath("\\\\src\\test.remote.ts")).toStrictEqual("/src/test.remote.ts");
  });

  test("handles a bare filename", () => {
    expect(toCanonicalPath("test.remote.ts")).toStrictEqual("/test.remote.ts");
  });
});

test(
  "toCanonicalPath: client and server hash inputs agree cross-platform",
  async () => {
    // Simulates the two code paths that must produce identical hashes:
    //   client: relative(cwd, absPath) → normalize       (bundler.ts)
    //   server: join(filePath, fileName) → normalize    (pack.ts)
    // Each side may yield POSIX- or Windows-style separators depending on
    // the platform; after toCanonicalPath both must be the same string.
    const posixClient = "src/test.remote.ts";
    const posixServer = "src/test.remote.ts";
    const winClient = "src\\test.remote.ts";
    const winServer = "src\\test.remote.ts";

    const canonical = "/src/test.remote.ts";
    expect(toCanonicalPath(posixClient)).toStrictEqual(canonical);
    expect(toCanonicalPath(posixServer)).toStrictEqual(canonical);
    expect(toCanonicalPath(winClient)).toStrictEqual(canonical);
    expect(toCanonicalPath(winServer)).toStrictEqual(canonical);

    const expectedHash = await generateHash(canonical);
    expect(await generateHash(toCanonicalPath(posixClient))).toStrictEqual(expectedHash);
    expect(await generateHash(toCanonicalPath(winClient))).toStrictEqual(expectedHash);
    expect(await generateHash(toCanonicalPath(posixServer))).toStrictEqual(expectedHash);
    expect(await generateHash(toCanonicalPath(winServer))).toStrictEqual(expectedHash);
  },
);

describe(generateHash.name, () => {
  test("is deterministic", async () => {
    expect(await generateHash("hello")).toStrictEqual(await generateHash("hello"));
  });

  test("returns an 8-character hex string", async () => {
    const hash = await generateHash("/src/test.remote.ts");
    expect(hash.length).toStrictEqual(8);
    expect(/^[0-9a-f]{8}$/.test(hash)).toStrictEqual(true);
  });

  test("produces different hashes for different inputs", async () => {
    const a = await generateHash("/src/a.remote.ts");
    const b = await generateHash("/src/b.remote.ts");
    expect(a === b).toStrictEqual(false);
  });
});

describe(isNodeError.name, () => {
  test("matches a node:fs error by its code", async () => {
    const error = await readFile("./does-not-exist.txt").catch((e) => e);
    expect(isNodeError(error, "ENOENT")).toStrictEqual(true);
    expect(isNodeError(error, "EEXIST")).toStrictEqual(false);
  });

  test("matches any error carrying the code, like Deno.errors", () => {
    // Deno's Deno.errors.* carry the same errno code as node:fs errors.
    const error = Object.assign(new Error("not found"), { code: "ENOENT" });
    expect(isNodeError(error, "ENOENT")).toStrictEqual(true);
  });

  test("rejects errors without a code and non-errors", () => {
    expect(isNodeError(new Error("boom"), "ENOENT")).toStrictEqual(false);
    expect(isNodeError({ code: "ENOENT" }, "ENOENT")).toStrictEqual(false);
    expect(isNodeError(undefined, "ENOENT")).toStrictEqual(false);
  });
});
