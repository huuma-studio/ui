import { describe, expect, test } from "vite-plus/test";

import { comparable } from "./rendered.ts";

describe(comparable.name, () => {
  test("names scripts the same in both builds", () => {
    const deno = comparable(
      'import { launch } from "/_huuma/0d2d03b4/huuma_ui_launch.js";\n' +
        'import $I1 from "/_huuma/0d2d03b4/be9d3798-counter.client.js";',
    );
    const vite = comparable(
      'import { launch } from "/assets/runtime-68o9yzIp.js";\n' +
        'import $I1 from "/assets/counter.client-Bb4_Qo-p.js";',
    );
    expect(deno).toStrictEqual(
      'import { launch } from "script:runtime.js";\nimport $I1 from "script:counter.client.js";',
    );
    expect(vite).toStrictEqual(deno);
  });

  test("numbers island ids in order and replaces nonces", () => {
    expect(
      comparable(
        "<!-- start_island_x7k2pa --><!--end_island_x7k2pa --><!-- start_island_0abc12 -->" +
          '<script nonce="977fa892-8806-4c3b-aec1-292d5b7cb2b3">' +
          'launch([{islandId: "x7k2pa"}, {islandId: "0abc12"}])',
      ),
    ).toStrictEqual(
      "<!-- start_island_island1 --><!--end_island_island1 --><!-- start_island_island2 -->" +
        '<script nonce="NONCE">launch([{islandId: "island1"}, {islandId: "island2"}])',
    );
  });
});
