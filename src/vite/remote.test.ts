import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, parseSync, type RunnableDevEnvironment, type ViteDevServer } from "vite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { remoteEndpoint } from "../platform/server/remote.ts";
import { huuma } from "./mod.ts";
import { remoteExports } from "./remote.ts";

const fixture = fileURLToPath(new URL("../../test/fixtures/basic", import.meta.url));

/** The exports of a remote module's source, as the plugin parses it. */
function exportsOf(code: string) {
  const { program, errors } = parseSync("todo.remote.ts", code);
  expect(errors).toStrictEqual([]);
  return remoteExports(program);
}

function namesOf(code: string): string[] {
  const { names, problems } = exportsOf(code);
  expect(problems).toStrictEqual([]);
  return names;
}

describe(remoteExports.name, () => {
  test("finds function declarations, also with overloads", () => {
    expect(
      namesOf(`
        export async function add(a: number, b: number): Promise<number> { return a + b; }
        export function load(id: string): Promise<string>;
        export function load(id: number): Promise<string>;
        export async function load(id: unknown) { return String(id); }
      `),
    ).toStrictEqual(["add", "load"]);
  });

  test("finds every declarator, with type annotations and multi-line parameters", () => {
    expect(
      namesOf(`
        type Fn = (id: string) => Promise<void>;
        export const save: Fn = async (id) => {}, remove = async function (
          id: string,
          force = false,
        ) {};
        export let rename = async () => {};
        export var archive = async () => {};
      `),
    ).toStrictEqual(["save", "remove", "rename", "archive"]);
  });

  test("finds export lists and re-exports by their exported name", () => {
    expect(
      namesOf(`
        async function add() {}
        async function remove() {}
        export { add, remove as delete, add as "add-item" };
        export { load } from "./load.ts";
        export { save as store } from "./save.ts";
      `),
    ).toStrictEqual(["add", "delete", "add-item", "load", "store"]);
  });

  test("finds the default export in all its forms", () => {
    expect(namesOf("export default async function reset() {}")).toStrictEqual(["default"]);
    expect(namesOf("export default async () => {};")).toStrictEqual(["default"]);
    expect(namesOf("const reset = async () => {}; export default reset;")).toStrictEqual([
      "default",
    ]);
    expect(namesOf("async function reset() {} export { reset as default };")).toStrictEqual([
      "default",
    ]);
  });

  test("skips type-only exports", () => {
    expect(
      namesOf(`
        import type { User } from "./user.ts";
        import { type Role, roles } from "./role.ts";
        interface Todo { title: string }
        type Id = string;
        export type { Todo };
        export interface Item {}
        export type Items = Item[];
        export declare const version: string;
        export { User, Role, Id, roles };
        export { type Todo as Task } from "./todo.ts";
        export type * from "./types.ts";
        export default interface Options {}
      `),
    ).toStrictEqual(["roles"]);
  });

  test("reports exports the stub can't name or call", () => {
    const { names, problems } = exportsOf(`
      export * from "./all.ts";
      export * as todos from "./todos.ts";
      export const { a, b } = { a: async () => {}, b: async () => {} };
      export class Store {}
      export enum Status { Open }
      export async function add() {}
    `);
    expect(names).toStrictEqual(["add"]);
    expect(problems.map((problem) => problem.message)).toStrictEqual([
      'A remote module can\'t re-export everything from "./all.ts": name the remote functions, e.g. `export { f } from "./all.ts"`.',
      'A remote module can\'t re-export everything from "./todos.ts": name the remote functions, e.g. `export { f } from "./todos.ts"`.',
      "A remote module can't export a destructured binding: export each remote function by name.",
      "A remote module can only export functions: a class can't be called from the browser.",
      "A remote module can only export functions: an enum can't be called from the browser.",
    ]);
  });
});

describe("remote modules", () => {
  let server: ViteDevServer;
  beforeAll(async () => {
    server = await createServer({
      root: fixture,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma()],
    });
  });
  afterAll(async () => {
    await server.close();
  });

  test("are stubs in the browser, calling their endpoint", async () => {
    const result = await server.environments.client.transformRequest("/app/sum.remote.ts");
    const code = result?.code ?? "";

    expect(code).toContain(JSON.stringify(await remoteEndpoint("app/sum.remote.ts")));
    // Oxc formats the stub again.
    expect(code).toMatch(/async \["add"\]\(\.\.\.args\) \{\s*return \$huuma\$call\("add", args\);/);
    expect(code).toMatch(/async \["server"\]\(\.\.\.args\)/);
    // Neither the functions' code nor their imports.
    expect(code).not.toContain("host.server");
  });

  test("keep their code on the server", async () => {
    const result = await server.environments.ssr.transformRequest("/app/sum.remote.ts");
    expect(result?.code).toContain("host.server");
    expect(result?.code).not.toContain("$huuma$call");
  });

  test("are listed by endpoint for the server", async () => {
    const { runner } = server.environments.ssr as RunnableDevEnvironment;
    const { default: remote } = (await runner.import("virtual:huuma/remote")) as {
      default: Record<string, Record<string, (...args: number[]) => Promise<number>>>;
    };

    const endpoint = await remoteEndpoint("app/sum.remote.ts");
    expect(Object.keys(remote)).toStrictEqual([endpoint]);
    expect(await remote[endpoint].add(1, 2)).toStrictEqual(3);
  });

  test("aren't listed for the browser", async () => {
    await expect(
      server.environments.client.pluginContainer.load("\0virtual:huuma/remote"),
    ).rejects.toThrow("virtual:huuma/remote imports every remote module and is server only.");
  });

  test("fail with exports the stub can't name", async () => {
    const id = join(fixture, "app/broken.remote.ts");
    const transform = server.environments.client.pluginContainer.transform(
      "export async function ok() {}\nexport * from './all.ts';\n",
      id,
    );
    await expect(transform).rejects.toThrow(
      'A remote module can\'t re-export everything from "./all.ts"',
    );
    await expect(transform).rejects.toMatchObject({ id, loc: { line: 2, column: 0 } });
  });
});
