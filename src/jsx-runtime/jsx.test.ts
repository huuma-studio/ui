import { describe, expect, test } from "vite-plus/test";
import { createElement, jsx, jsxAttr } from "./jsx.ts";

describe("jsxAttr boolean attributes", () => {
  test("omits falsy boolean attributes", () => {
    expect(jsxAttr("disabled", false)).toStrictEqual("");
    expect(jsxAttr("disabled", undefined)).toStrictEqual("");
    expect(jsxAttr("disabled", null)).toStrictEqual("");
    expect(jsxAttr("disabled", 0)).toStrictEqual("");
    expect(jsxAttr("disabled", "")).toStrictEqual("");
    expect(jsxAttr("disabled", NaN)).toStrictEqual("");
  });

  test("emits the bare attribute name for true", () => {
    expect(jsxAttr("disabled", true)).toStrictEqual({
      templates: ["disabled"],
      nodes: [""],
    });
    expect(jsxAttr("readonly", true)).toStrictEqual({
      templates: ["readonly"],
      nodes: [""],
    });
  });

  test("covers media and embed boolean attributes", () => {
    expect(jsxAttr("disablepictureinpicture", false)).toStrictEqual("");
    expect(jsxAttr("disableremoteplayback", false)).toStrictEqual("");
    expect(jsxAttr("disablepictureinpicture", true)).toStrictEqual({
      templates: ["disablepictureinpicture"],
      nodes: [""],
    });
    expect(jsxAttr("muted", true)).toStrictEqual({
      templates: ["muted"],
      nodes: [""],
    });
  });

  test("emits the bare attribute name for any truthy value", () => {
    expect(jsxAttr("checked", 1)).toStrictEqual({
      templates: ["checked"],
      nodes: [""],
    });
    expect(jsxAttr("open", "yes")).toStrictEqual({
      templates: ["open"],
      nodes: [""],
    });
  });
});

describe("jsxAttr non-boolean attributes", () => {
  test("emits string values verbatim", () => {
    expect(jsxAttr("class", "btn primary")).toStrictEqual({
      templates: [`class="btn primary"`],
      nodes: [""],
    });
    expect(jsxAttr("aria-busy", "false")).toStrictEqual({
      templates: [`aria-busy="false"`],
      nodes: [""],
    });
    expect(jsxAttr("value", "")).toStrictEqual({
      templates: [`value=""`],
      nodes: [""],
    });
  });

  test("emits the bare name for static true", () => {
    expect(jsxAttr("title", true)).toStrictEqual({ templates: ["title"], nodes: [""] });
  });

  test("writes true and false as strings for aria-* and data-*", () => {
    expect(jsxAttr("data-active", true)).toStrictEqual({
      templates: ['data-active="true"'],
      nodes: [""],
    });
    expect(jsxAttr("aria-expanded", false)).toStrictEqual({
      templates: ['aria-expanded="false"'],
      nodes: [""],
    });
  });

  test("omits values that are neither strings, numbers nor true", () => {
    expect(jsxAttr("class", false)).toStrictEqual("");
    expect(jsxAttr("class", undefined)).toStrictEqual("");
    expect(jsxAttr("class", null)).toStrictEqual("");
  });

  test("emits numbers as attribute values", () => {
    expect(jsxAttr("tabindex", 0)).toStrictEqual({
      templates: [`tabindex="0"`],
      nodes: [""],
    });
    expect(jsxAttr("colspan", 2)).toStrictEqual({
      templates: [`colspan="2"`],
      nodes: [""],
    });
  });
});

describe(createElement.name, () => {
  test("builds the same node as jsx with the key taken from the props", () => {
    expect(createElement("div", { id: "a", key: "k", children: "hi" })).toStrictEqual(
      jsx("div", { id: "a", children: "hi" }, "k"),
    );
  });

  test("takes children from the arguments over props.children", () => {
    expect(createElement("p", { children: "ignored" }, "only")).toStrictEqual(
      jsx("p", { children: "only" }),
    );
    expect(createElement("p", null, "a", "b")).toStrictEqual(jsx("p", { children: ["a", "b"] }));
  });

  test("drops the __self and __source props of the dev transform", () => {
    expect(
      createElement("div", {
        id: "a",
        __self: undefined,
        __source: { fileName: "page.tsx", lineNumber: 1, columnNumber: 1 },
      }),
    ).toStrictEqual(jsx("div", { id: "a" }));
  });

  test("does not mutate the props it is given", () => {
    const props = { key: "k", "on-click": () => {} };
    createElement("button", props);
    expect(Object.keys(props)).toStrictEqual(["key", "on-click"]);
  });
});
