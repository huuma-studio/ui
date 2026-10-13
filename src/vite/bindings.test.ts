import { describe, expect, test } from "vite-plus/test";
import { parseSync } from "vite";

import { valueBindings } from "./bindings.ts";

const bindingsOf = (code: string) => [...valueBindings(parseSync("module.ts", code).program)];

describe(valueBindings.name, () => {
  test("finds imports, variables, functions, classes and enums", () => {
    expect(
      bindingsOf(`
        import a, { b, c as d } from "./a.ts";
        import * as e from "./e.ts";
        const f = 1;
        export let g;
        function h() {}
        export async function i() {}
        class J {}
        export default class K {}
        enum L { M }
      `),
    ).toStrictEqual(["a", "b", "d", "e", "f", "g", "h", "i", "J", "K", "L"]);
  });

  test("finds the names in destructuring patterns", () => {
    expect(
      bindingsOf("const { a, b: { c }, d = 1, ...e } = x; const [f, , [g], h = 2, ...i] = y;"),
    ).toStrictEqual(["a", "c", "d", "e", "f", "g", "h", "i"]);
  });

  test("leaves out types and ambient declarations", () => {
    expect(
      bindingsOf(`
        import type { A } from "./a.ts";
        import { type B, c } from "./b.ts";
        type D = string;
        interface E {}
        declare const f: string;
        declare function g(): void;
        declare class H {}
        export default function () {}
      `),
    ).toStrictEqual(["c"]);
  });
});
