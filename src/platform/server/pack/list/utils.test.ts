import { assertEquals } from "@std/assert";
import { generateHash, toCanonicalPath } from "./utils.ts";

Deno.test(toCanonicalPath.name, async (t) => {
  await t.step("leaves an already-canonical path unchanged", () => {
    assertEquals(toCanonicalPath("/src/test.remote.ts"), "/src/test.remote.ts");
  });

  await t.step("prepends a leading slash to relative POSIX paths", () => {
    assertEquals(toCanonicalPath("src/test.remote.ts"), "/src/test.remote.ts");
  });

  await t.step("converts Windows backslashes to forward slashes", () => {
    assertEquals(
      toCanonicalPath("src\\test.remote.ts"),
      "/src/test.remote.ts",
    );
    assertEquals(
      toCanonicalPath("\\src\\test.remote.ts"),
      "/src/test.remote.ts",
    );
  });

  await t.step("normalizes mixed separators", () => {
    assertEquals(
      toCanonicalPath("src\\nested/test.remote.ts"),
      "/src/nested/test.remote.ts",
    );
  });

  await t.step("collapses repeated leading slashes", () => {
    assertEquals(toCanonicalPath("///src/test.remote.ts"), "/src/test.remote.ts");
    assertEquals(toCanonicalPath("\\\\src\\test.remote.ts"), "/src/test.remote.ts");
  });

  await t.step("handles a bare filename", () => {
    assertEquals(toCanonicalPath("test.remote.ts"), "/test.remote.ts");
  });
});

Deno.test(
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
    assertEquals(toCanonicalPath(posixClient), canonical);
    assertEquals(toCanonicalPath(posixServer), canonical);
    assertEquals(toCanonicalPath(winClient), canonical);
    assertEquals(toCanonicalPath(winServer), canonical);

    const expectedHash = await generateHash(canonical);
    assertEquals(await generateHash(toCanonicalPath(posixClient)), expectedHash);
    assertEquals(await generateHash(toCanonicalPath(winClient)), expectedHash);
    assertEquals(await generateHash(toCanonicalPath(posixServer)), expectedHash);
    assertEquals(await generateHash(toCanonicalPath(winServer)), expectedHash);
  },
);

Deno.test(generateHash.name, async (t) => {
  await t.step("is deterministic", async () => {
    assertEquals(await generateHash("hello"), await generateHash("hello"));
  });

  await t.step("returns an 8-character hex string", async () => {
    const hash = await generateHash("/src/test.remote.ts");
    assertEquals(hash.length, 8);
    assertEquals(/^[0-9a-f]{8}$/.test(hash), true);
  });

  await t.step("produces different hashes for different inputs", async () => {
    const a = await generateHash("/src/a.remote.ts");
    const b = await generateHash("/src/b.remote.ts");
    assertEquals(a === b, false);
  });
});
