import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import process from "node:process";
import { join } from "node:path";

import {
  createDirectory,
  deleteDirectory,
  shimPublicEnvVars,
} from "./mod.ts";

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
 * Gives the tests of the enclosing describe() one temporary directory as
 * the working directory, created before and removed after all of them.
 */
function useTempDir(): { dir: string } {
  const temp = { dir: "" };
  let cwd: string;
  beforeAll(async () => {
    temp.dir = await mkdtemp(join(tmpdir(), "huuma-pack-"));
    cwd = process.cwd();
    process.chdir(temp.dir);
  });
  afterAll(async () => {
    process.chdir(cwd);
    await rm(temp.dir, { recursive: true, force: true });
  });
  return temp;
}

describe(createDirectory.name, () => {
  const temp = useTempDir();

  test("creates nested directories", async () => {
    await createDirectory(join(temp.dir, "a", "b"));
    expect(await exists(join(temp.dir, "a", "b"))).toStrictEqual(true);
  });

  test("does not fail when the directory exists", async () => {
    await createDirectory(join(temp.dir, "a", "b"));
    expect(await exists(join(temp.dir, "a", "b"))).toStrictEqual(true);
  });
});

describe(deleteDirectory.name, () => {
  const temp = useTempDir();

  test("removes a directory with its contents", async () => {
    await mkdir(join(temp.dir, "a", "b"), { recursive: true });
    await writeFile(join(temp.dir, "a", "b", "file.js"), "");
    await deleteDirectory(join(temp.dir, "a"));
    expect(await exists(join(temp.dir, "a"))).toStrictEqual(false);
  });

  test("does not fail when the directory is missing", async () => {
    await deleteDirectory(join(temp.dir, "missing"));
  });
});

test(shimPublicEnvVars.name, async () => {
  const publicValue = process.env.PUBLIC_HUUMA_TEST;
  const secretValue = process.env.HUUMA_TEST_SECRET;
  process.env.PUBLIC_HUUMA_TEST = "visible";
  process.env.HUUMA_TEST_SECRET = "hidden";
  try {
    await inTempDir(async () => {
      const path = await shimPublicEnvVars();
      const shim = await readFile(path, "utf8");
      expect(shim.includes('"PUBLIC_HUUMA_TEST":"visible"')).toStrictEqual(true);
      expect(shim.includes("HUUMA_TEST_SECRET")).toStrictEqual(false);
      expect(shim.includes("hidden")).toStrictEqual(false);
    });
  } finally {
    if (publicValue === undefined) {
      delete process.env.PUBLIC_HUUMA_TEST;
    } else {
      process.env.PUBLIC_HUUMA_TEST = publicValue;
    }
    if (secretValue === undefined) {
      delete process.env.HUUMA_TEST_SECRET;
    } else {
      process.env.HUUMA_TEST_SECRET = secretValue;
    }
  }
});
