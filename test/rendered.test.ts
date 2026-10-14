import { describe, expect, test } from "vite-plus/test";

import { comparable } from "./rendered.ts";

describe(comparable.name, () => {
  test("names scripts by their module, without Vite's hash", () => {
    expect(
      comparable(
        'import { launch } from "/assets/runtime-68o9yzIp.js";\n' +
          'import $I1 from "/shop/assets/counter.client-Bb4_Qo-p.js";',
      ),
    ).toStrictEqual(
      'import { launch } from "script:runtime.js";\nimport $I1 from "script:counter.client.js";',
    );
  });

  test("numbers island ids in order", () => {
    expect(
      comparable(
        "<!-- start_island_x7k2pa --><!--end_island_x7k2pa --><!-- start_island_0abc12 -->" +
          'launch([{islandId: "x7k2pa"}, {islandId: "0abc12"}])',
      ),
    ).toStrictEqual(
      "<!-- start_island_island1 --><!--end_island_island1 --><!-- start_island_island2 -->" +
        'launch([{islandId: "island1"}, {islandId: "island2"}])',
    );
  });

  test("numbers nonces in order, so different ones stay different", () => {
    const csp = (nonce: string) => `content-security-policy: script-src-elem 'nonce-${nonce}'`;
    const script = (nonce: string) => `<script nonce="${nonce}">`;
    const a = "977fa892-8806-4c3b-aec1-292d5b7cb2b3";
    const b = "a99a68bb-1f79-418c-877e-9efd6a11404f";
    expect(comparable(`${csp(a)}\n${script(a)}`)).toStrictEqual(
      `${csp("nonce1")}\n${script("nonce1")}`,
    );
    expect(comparable(`${csp(a)}\n${script(b)}`)).toStrictEqual(
      `${csp("nonce1")}\n${script("nonce2")}`,
    );
  });
});
