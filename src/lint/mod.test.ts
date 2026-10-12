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

tester.run("async-remote-functions", rule("async-remote-functions"), {
  valid: [
    remote("export async function save() {}"),
    remote("export const save = async () => {};"),
    remote("export const save = async function () {};"),
    remote("export type Input = { email: string };"),
    remote("export interface Input { email: string }"),
    remote('export type { Input } from "./input.ts";'),
    { code: "export function helper() {}", filename: "helper.ts" },
  ],
  invalid: [
    remoteError("export function save() {}"),
    remoteError("export const save = () => {};"),
    remoteError("export const limit = 10;"),
    // The client stub generator does not handle this form yet.
    remoteError("const save = async () => {}; export { save };"),
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
