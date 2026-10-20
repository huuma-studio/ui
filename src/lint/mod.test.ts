import { describe, expect, test } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";
import plugin from "./mod.ts";

RuleTester.describe = describe;
RuleTester.it = test;

const tester = new RuleTester();

// The plugin types its rules structurally, without Oxlint's AST types.
type TesterRule = Parameters<RuleTester["run"]>[1];
const rule = (name: string) => plugin.rules[name] as unknown as TesterRule;

describe("plugin", () => {
  test("is named for Oxlint, ESLint and deno lint", () => {
    expect(plugin.name).toBe("huuma");
    expect(plugin.meta.name).toBe("huuma");
  });

  test("enables every rule in the recommended config", () => {
    expect(Object.keys(plugin.configs.recommended.rules)).toStrictEqual(
      Object.keys(plugin.rules).map((rule) => `huuma/${rule}`),
    );
  });
});

const remote = (code: string) => ({ code, filename: "actions.remote.ts" });
const remoteError = (code: string) => ({
  ...remote(code),
  errors: [{ message: "Huuma remote function MUST be an async function export" }],
});

const exportAllError = (code: string) => ({
  ...remote(code),
  errors: [
    {
      message: "Huuma remote modules can't use `export *`: export each remote function by name",
    },
  ],
});

tester.run("async-remote-functions", rule("async-remote-functions"), {
  valid: [
    remote("export async function save() {}"),
    remote("export async function save<T>(\n  input: T,\n): Promise<T> {\n  return input;\n}"),
    remote(
      "export function save(id: string): Promise<void>;\nexport function save(id: number): Promise<void>;\nexport async function save(id: unknown) {}",
    ),
    remote("export type Input = { email: string };"),
    remote("export interface Input { email: string }"),
    remote('export type { Input } from "./input.ts";'),
    remote('export type * from "./input.ts";'),
    // The forms the Vite plugin's Oxc-based stub generator finds.
    remote("export const save = async () => {};"),
    remote("export const save = async function () {};"),
    remote("export const save: Handler = async () => {};"),
    remote("export const save = (async () => {}) satisfies Handler;"),
    remote("export const first = async () => {}, second = async () => {};"),
    remote("export let save = async (\n  id: string,\n  force = false,\n) => {};"),
    remote("const save = async () => {}; export { save };"),
    remote('async function save() {} export { save as store, save as "save-item" };'),
    remote('import { save } from "./db.ts"; export { save };'),
    remote('export { save, remove as delete } from "./db.ts";'),
    remote('import type { Input } from "./input.ts"; interface Item {} export { Input, Item };'),
    remote("const save = async () => {}; type save = typeof save; export { save };"),
    // The default export is the remote function `default`.
    remote("export default async function save() {}"),
    remote("export default async function () {}"),
    remote("export default async () => {};"),
    remote("export default (async () => {}) satisfies Handler;"),
    remote("const save = async () => {}; export default save;"),
    remote('import save from "./db.ts"; export default save;'),
    remote("export default interface Input { email: string }"),
    remote("const save = async () => {}; export default save satisfies Handler;"),
    remote('import save from "./db.ts"; export default (save as Handler);'),
    remote(
      "export default function save(id: string): Promise<void>;\nexport default function save(id: number): Promise<void>;\nexport default async function save(id: unknown) {}",
    ),
    { code: "export function helper() {}", filename: "helper.ts" },
    { code: 'export * from "./helpers.ts";', filename: "helper.ts" },
  ],
  invalid: [
    remoteError("export function save() {}"),
    remoteError("export const limit = 10;"),
    remoteError("export async function* stream() {}"),
    remoteError("export const save = () => {};"),
    remoteError("export const save = async () => {}, limit = 10;"),
    remoteError("export const { save } = handlers;"),
    remoteError("export class Store {}"),
    remoteError("export enum Status { Open }"),
    remoteError("function save() {} export { save };"),
    remoteError("const limit = 10; export { limit };"),
    remoteError("const limit = 10; type limit = number; export { limit };"),
    remoteError("export default function hello() {}"),
    remoteError("export default function () {}"),
    remoteError("export default () => {};"),
    remoteError("export default async function* stream() {}"),
    remoteError("export default class Store {}"),
    remoteError("export default 10;"),
    remoteError("export default { save: async () => {} };"),
    remoteError("function hello() {} export default hello;"),
    remoteError("export default handlers;"),
    remoteError("function hello() {} export default hello satisfies Handler;"),
    remoteError(
      "export default function save(id: string): Promise<void>;\nexport default function save(id: unknown) {}",
    ),
    exportAllError('export * from "./db.ts";'),
    exportAllError('export * as db from "./db.ts";'),
  ],
});

const hookError = {
  message: "Huuma component hooks not allowed in async components",
};

tester.run("no-async-hook-calling", rule("no-async-hook-calling"), {
  valid: ["function Counter() { $signal(0); }", "async function load() { fetchData(); }"],
  invalid: [
    { code: "async function Counter() { $signal(0); }", errors: [hookError] },
    { code: "const Counter = async () => { $signal(0); };", errors: [hookError] },
    {
      code: "const Counter = async function () { $signal(0); };",
      errors: [hookError],
    },
  ],
});

const island = (code: string) => ({ code, filename: "counter.client.tsx" });
const islandError = (code: string) => ({
  ...island(code),
  errors: [{ message: "client-side does not support async jsx" }],
});

tester.run("no-async-client-jsx", rule("no-async-client-jsx"), {
  valid: [
    island("export default function Counter() { return null; }"),
    island("const Counter = () => null; export default Counter;"),
    { code: "export default async function Page() {}", filename: "page.tsx" },
  ],
  invalid: [
    islandError("export default async function Counter() {}"),
    islandError("export default async () => null;"),
    islandError("const Counter = async () => null; export default Counter;"),
  ],
});
const contextError = (code: string, name = "requestContext") => ({
  ...island(code),
  errors: [
    {
      message: `${name}() works on the server only, but islands render in the browser too: read the request in the page and pass the island what it needs as props`,
    },
  ],
});

tester.run("no-request-context-in-islands", rule("no-request-context-in-islands"), {
  valid: [
    // Pages, layouts, remote functions and server modules may.
    {
      code: 'import { requestContext } from "@huuma/ui/server";\nexport default function Page() { return requestContext().request.url; }',
      filename: "app/page.tsx",
    },
    {
      code: 'import { requestContext } from "@huuma/ui/server";\nexport async function save() { requestContext(); }',
      filename: "app/todos.remote.ts",
    },
    // Types only, or other functions of the module.
    island('import type { RequestContext } from "@huuma/ui/server";\nlet c: RequestContext;'),
    island('import { type RequestContext, Meta } from "@huuma/ui/server";\nMeta({});'),
    // A function of the same name from elsewhere.
    island('import { requestContext } from "./context.ts";\nrequestContext();'),
    island("function requestContext() {}\nrequestContext();"),
  ],
  invalid: [
    contextError(
      'import { requestContext } from "@huuma/ui/server";\nexport default function Counter() { const { auth } = requestContext(); return null; }',
    ),
    contextError(
      'import { hasRequestContext } from "@huuma/ui/server";\nif (hasRequestContext()) {}',
      "hasRequestContext",
    ),
    // Renamed imports.
    contextError('import { requestContext as ctx } from "@huuma/ui/server";\nctx();'),
    contextError('import { "requestContext" as ctx } from "@huuma/ui/server";\nctx();'),
    // A namespace import.
    contextError('import * as server from "@huuma/ui/server";\nserver.requestContext();'),
    contextError('import * as server from "@huuma/ui/server";\nserver["requestContext"]();'),
    // From JSR or npm, with a version.
    contextError(
      'import { requestContext } from "jsr:@huuma/ui@^0.3.0/server";\nrequestContext();',
    ),
    contextError('import { requestContext } from "npm:@huuma/ui/server";\nrequestContext();'),
  ],
});
