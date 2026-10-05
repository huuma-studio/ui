import { assertEquals } from "@std/assert";
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
import { join } from "@std/path/join";
import { fromFileUrl } from "@std/path/from-file-url";

import { createUIApp } from "../../app.ts";
import { jsx } from "../../../../jsx-runtime/mod.ts";
import {
  createDirectory,
  deleteDirectory,
  list,
  shimPublicEnvVars,
} from "./mod.ts";

const repoRoot = fromFileUrl(new URL("../../../../../", import.meta.url));

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

Deno.test(createDirectory.name, async (t) => {
  await inTempDir(async (dir) => {
    await t.step("creates nested directories", async () => {
      await createDirectory(join(dir, "a", "b"));
      assertEquals(await exists(join(dir, "a", "b")), true);
    });

    await t.step("does not fail when the directory exists", async () => {
      await createDirectory(join(dir, "a", "b"));
      assertEquals(await exists(join(dir, "a", "b")), true);
    });
  });
});

Deno.test(deleteDirectory.name, async (t) => {
  await inTempDir(async (dir) => {
    await t.step("removes a directory with its contents", async () => {
      await mkdir(join(dir, "a", "b"), { recursive: true });
      await writeFile(join(dir, "a", "b", "file.js"), "");
      await deleteDirectory(join(dir, "a"));
      assertEquals(await exists(join(dir, "a")), false);
    });

    await t.step("does not fail when the directory is missing", async () => {
      await deleteDirectory(join(dir, "missing"));
    });
  });
});

Deno.test(shimPublicEnvVars.name, async () => {
  process.env.PUBLIC_HUUMA_TEST = "visible";
  process.env.HUUMA_TEST_SECRET = "hidden";
  try {
    await inTempDir(async () => {
      const path = await shimPublicEnvVars();
      const shim = await readFile(path, "utf8");
      assertEquals(shim.includes('"PUBLIC_HUUMA_TEST":"visible"'), true);
      assertEquals(shim.includes("HUUMA_TEST_SECRET"), false);
      assertEquals(shim.includes("hidden"), false);
    });
  } finally {
    delete process.env.PUBLIC_HUUMA_TEST;
    delete process.env.HUUMA_TEST_SECRET;
  }
});

Deno.test({
  name: `${list.name}: bundles the app and registers the live reload route`,
  // esbuild keeps its service process alive across builds.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const config = JSON.parse(
      await readFile(join(repoRoot, "deno.json"), "utf8"),
    );

    await inTempDir(async (dir) => {
      // Resolve "@huuma/ui" to this repository so the fixture app and the
      // bundled browser runtime use the code under test.
      await writeFile(
        join(dir, "deno.json"),
        JSON.stringify({
          imports: {
            ...config.imports,
            "@huuma/ui/jsx-runtime": join(repoRoot, "src/jsx-runtime/mod.ts"),
            "@huuma/ui/server/pack": join(
              repoRoot,
              "src/platform/server/pack/mod.ts",
            ),
          },
          compilerOptions: config.compilerOptions,
        }),
      );
      await mkdir(join(dir, "app"));
      await writeFile(
        join(dir, "app", "page.tsx"),
        'export default function Page() { return "Hello"; }',
      );

      const app = createUIApp(({ children }) =>
        jsx("html", { children: [jsx("body", { children: [children] })] })
      );
      await list(app, { isProd: false });
      const handle = app.deliver();
      const connection = { remoteAddr: { transport: "tcp" } };

      // Without the upgrade header the route answers 400; an unregistered
      // route would answer 404.
      const websocket = await handle(
        new Request("http://localhost/_websocket"),
        connection,
      );
      await websocket.body?.cancel();
      assertEquals(websocket.status, 400);

      const page = await handle(
        new Request("http://localhost/"),
        connection,
      );
      assertEquals(page.status, 200);
      assertEquals((await page.text()).includes("Hello"), true);

      assertEquals(await exists(join(dir, ".huuma", "list.ts")), true);
      assertEquals(
        await exists(join(dir, ".huuma", "scripts", "huuma_ui_launch.js")),
        true,
      );
      // The env shim is only needed while bundling.
      assertEquals(await exists(join(dir, ".huuma", "shims")), false);
    });
  },
});
