import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, parseSync, type InlineConfig, type ViteDevServer } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { hasDecorators } from "./decorators.ts";
import { huuma, type HuumaOptions } from "./mod.ts";

const fixture = fileURLToPath(new URL("../../test/fixtures/decorators", import.meta.url));

function start(options?: HuumaOptions, config: InlineConfig = {}): Promise<ViteDevServer> {
  return createServer({
    root: fixture,
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
    plugins: [huuma(options)],
    ...config,
  });
}

describe(hasDecorators.name, () => {
  const parse = (code: string) => parseSync("module.ts", code).program;

  test("finds decorators on classes and their members, also nested", () => {
    expect(hasDecorators(parse("@inject() class A {}"))).toStrictEqual(true);
    expect(hasDecorators(parse("export default @inject() class A {}"))).toStrictEqual(true);
    expect(hasDecorators(parse("class A { @log method() {} }"))).toStrictEqual(true);
    expect(hasDecorators(parse("function f() { return class { @log x = 1; }; }"))).toStrictEqual(
      true,
    );
  });

  test("ignores an @ elsewhere", () => {
    expect(
      hasDecorators(
        parse(
          [
            'import { inject } from "@huuma/inject";',
            "/** @param name The name. */",
            'const mail = "ada@example.com";',
            "class A {}",
          ].join("\n"),
        ),
      ),
    ).toStrictEqual(false);
  });
});

describe("decorators", () => {
  let server: ViteDevServer;
  beforeAll(async () => {
    server = await start();
    await server.listen();
  });
  afterAll(async () => {
    await server.close();
  });

  test("work like under Deno: @inject() registers a class with its dependencies", async () => {
    const response = await fetch(new URL("/", server.resolvedUrls!.local[0]));
    expect(response.status).toStrictEqual(200);
    expect(await response.text()).toContain("<h1>Hello decorators</h1>");
  });

  test("are lowered in the browser too, with Symbol.metadata", async () => {
    const result = await server.environments.client.transformRequest("/app/services.ts");
    expect(result?.code).not.toContain("@inject(");
    expect(result?.code).toMatch(/^Symbol\.metadata \?\?= Symbol\.for\("Symbol\.metadata"\);/);
  });

  test("leave modules without decorators to Oxc alone", async () => {
    // Imports from "@huuma/…", but has no decorators.
    const result = await server.environments.client.transformRequest("/app/page.tsx");
    expect(result?.code).not.toContain("Symbol.metadata");
  });
});

describe("decorators turned off", () => {
  let server: ViteDevServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  test("with `decorators: false`", async () => {
    server = await start({ decorators: false });
    const result = await server.environments.client.transformRequest("/app/services.ts");
    expect(result?.code).toContain("@inject(");
  });

  test("automatically, when the app uses Oxc's legacy decorators", async () => {
    server = await start(undefined, { oxc: { decorator: { legacy: true } } });
    const result = await server.environments.client.transformRequest("/app/services.ts");
    expect(result?.code).not.toContain("Symbol.metadata");
  });
});

test("names the packages to install when Babel is missing", async () => {
  // A root outside the repository, where Babel can't be resolved.
  const root = await mkdtemp(join(tmpdir(), "huuma-decorators-"));
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, ws: false },
    plugins: [huuma()],
  });
  try {
    await expect(
      server.environments.ssr.pluginContainer.transform(
        "@inject() export class A {}",
        join(root, "a.ts"),
      ),
    ).rejects.toThrow(
      "Decorators need @babel/core and @babel/plugin-proposal-decorators in the app's dependencies",
    );
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
