import { describe, expect, test } from "vite-plus/test";

import { appBase } from "./base.ts";

describe(appBase.name, () => {
  test("keeps a path", () => {
    expect(appBase("/")).toStrictEqual("/");
    expect(appBase("/shop/")).toStrictEqual("/shop/");
  });

  test("takes the path of a URL", () => {
    expect(appBase("https://cdn.example/shop/")).toStrictEqual("/shop/");
    expect(appBase("https://cdn.example/")).toStrictEqual("/");
    expect(appBase("//cdn.example/shop/")).toStrictEqual("/shop/");
  });

  test("is / for a relative base", () => {
    expect(appBase("./")).toStrictEqual("/");
    expect(appBase("")).toStrictEqual("/");
  });
});
