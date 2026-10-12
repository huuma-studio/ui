import { describe, expect, test } from "vite-plus/test";
import { parseSync } from "vite";

import { remoteExports } from "./remote.ts";

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
