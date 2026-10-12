import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createLogger, createServer, type RunnableDevEnvironment, type ViteDevServer } from "vite";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { huuma } from "./mod.ts";

const fixtures = fileURLToPath(new URL("../../test/fixtures", import.meta.url));

describe("Deno.env.get()", () => {
  // A copy of the basic fixture (with its .env) and modules that read the
  // environment the Deno way.
  let root: string;
  let server: ViteDevServer;
  const warnings: string[] = [];
  const logger = createLogger("silent");
  logger.warn = (message) => {
    warnings.push(message);
  };

  beforeAll(async () => {
    root = await mkdtemp(join(fixtures, ".tmp-env-"));
    await cp(join(fixtures, "basic"), root, { recursive: true });
    await writeFile(
      join(root, "app/legacy.ts"),
      [
        'export const greeting = Deno.env.get("PUBLIC_GREETING");',
        'export const home = Deno.env.get("HOME");',
        "",
      ].join("\n"),
    );
    await writeFile(
      join(root, "app/own.ts"),
      'const Deno = { env: { get: () => "own" } };\nexport const value = Deno.env.get("X");\n',
    );
    server = await createServer({
      root,
      configFile: false,
      customLogger: logger,
      server: { middlewareMode: true, ws: false },
      plugins: [huuma()],
    });
  });
  afterAll(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });

  test("reads PUBLIC_* variables in the browser, and nothing else", async () => {
    const result = await server.environments.client.transformRequest("/app/legacy.ts");
    expect(result?.code).toContain("get: (key) => import.meta.env[key]");
    expect(result?.code).toContain('"PUBLIC_GREETING": "Hello"');
    expect(result?.code).not.toContain("SECRET_TOKEN");
    expect(result?.code).not.toContain("process.env");
  });

  test("reads the process environment too on the server", async () => {
    const { runner } = server.environments.ssr as RunnableDevEnvironment;
    const legacy = (await runner.import("/app/legacy.ts")) as Record<string, unknown>;
    expect(legacy.greeting).toStrictEqual("Hello");
    expect(legacy.home).toStrictEqual(process.env.HOME);
  });

  test("warns that it's deprecated", () => {
    expect(
      warnings.some((warning) => warning.includes("app/legacy.ts: `Deno.env.get()` is deprecated")),
    ).toStrictEqual(true);
  });

  test("leaves a module's own Deno alone", async () => {
    const { runner } = server.environments.ssr as RunnableDevEnvironment;
    expect(((await runner.import("/app/own.ts")) as { value: string }).value).toStrictEqual("own");
    expect(warnings.some((warning) => warning.includes("app/own.ts"))).toStrictEqual(false);
  });
});
