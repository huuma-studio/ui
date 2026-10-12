import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeListFrom } from "./list.ts";
import type { Pack } from "./list.ts";

describe(writeListFrom.name, () => {
  let packPath: string;
  let listPath: string;
  const emptyPack: Pack = {
    pages: [],
    layouts: [],
    middlewares: [],
    islands: [],
    scripts: [],
    remoteFunctions: [],
  };
  const islandPack: Pack = {
    ...emptyPack,
    islands: [{ name: "I0", filePath: "components", fileName: "a.client.tsx" }],
  };

  beforeAll(async () => {
    packPath = await mkdtemp(join(tmpdir(), "huuma-list-"));
    listPath = join(packPath, "list.ts");
  });
  afterAll(async () => {
    await rm(packPath, { recursive: true, force: true });
  });

  test("creates the list when it does not exist yet", async () => {
    expect(await writeListFrom(emptyPack, packPath)).toStrictEqual(listPath);
    expect(await readFile(listPath, "utf8")).toStrictEqual(
      "// Huuma UI generated code - Do not modify!",
    );
  });

  test("does not rewrite an unchanged list", async () => {
    const before = (await stat(listPath)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeListFrom(emptyPack, packPath);
    expect((await stat(listPath)).mtimeMs).toStrictEqual(before);
  });

  test("replaces a list whose content changed", async () => {
    await writeFile(listPath, "// stale");
    await writeListFrom(islandPack, packPath);
    const content = await readFile(listPath, "utf8");
    expect(content.includes('import * as I0 from "../components/a.client.tsx";')).toStrictEqual(
      true,
    );
  });
});
