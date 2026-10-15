import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { attributeValue, isValidAttributeName, isValidTagName } from "./attributes.ts";

describe(isValidAttributeName.name, () => {
  test("accepts what setAttribute() accepts", () => {
    for (const name of ["class", "data-x", "aria-label", "xlink:href", "x.y", "_a", "über"]) {
      expect(isValidAttributeName(name), name).toStrictEqual(true);
    }
  });

  test("rejects names that could leave the attribute", () => {
    for (const name of ["", "a b", "a=b", "a>b", "a/b", 'a"b', "a'b", "1a", "-a", "@click"]) {
      expect(isValidAttributeName(name), name).toStrictEqual(false);
    }
  });
});

describe(isValidTagName.name, () => {
  test("accepts HTML, SVG and custom element names", () => {
    for (const tag of ["div", "h1", "foreignObject", "my-element", "svg:rect"]) {
      expect(isValidTagName(tag), tag).toStrictEqual(true);
    }
  });

  test("rejects anything else", () => {
    for (const tag of ["", "img src=x", "div>", "1h", "-x"]) {
      expect(isValidTagName(tag), tag).toStrictEqual(false);
    }
  });
});

describe(attributeValue.name, () => {
  const nodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    vi.restoreAllMocks();
  });

  test("writes strings and numbers as strings", () => {
    expect(attributeValue("class", "a")).toStrictEqual("a");
    expect(attributeValue("tabindex", 0)).toStrictEqual("0");
    expect(attributeValue("alt", "")).toStrictEqual("");
  });

  test("leaves out other values", () => {
    for (const value of [null, undefined, {}, () => {}]) {
      expect(attributeValue("class", value)).toStrictEqual(undefined);
    }
  });

  test("writes boolean attributes by truthiness", () => {
    expect(attributeValue("disabled", true)).toStrictEqual("");
    expect(attributeValue("disabled", 1)).toStrictEqual("");
    expect(attributeValue("disabled", false)).toStrictEqual(undefined);
    expect(attributeValue("disabled", "")).toStrictEqual(undefined);
  });

  test("writes true and false by React's rule", () => {
    expect(attributeValue("aria-expanded", false)).toStrictEqual("false");
    expect(attributeValue("aria-expanded", true)).toStrictEqual("true");
    expect(attributeValue("data-open", false)).toStrictEqual("false");
    expect(attributeValue("title", true)).toStrictEqual("");
    expect(attributeValue("title", false)).toStrictEqual(undefined);
  });

  test("leaves out string event handlers and javascript: URLs", () => {
    expect(attributeValue("onclick", "alert(1)")).toStrictEqual(undefined);
    expect(attributeValue("onClick", "alert(1)")).toStrictEqual(undefined);
    expect(attributeValue("href", "javascript:alert(1)")).toStrictEqual(undefined);
    expect(attributeValue("HREF", "\tjava\nscript:alert(1)")).toStrictEqual(undefined);
    expect(attributeValue("xlink:href", "JAVASCRIPT:alert(1)")).toStrictEqual(undefined);
    expect(attributeValue("href", "https://example.com/javascript:")).toStrictEqual(
      "https://example.com/javascript:",
    );
  });

  test("warns once per problem in development, never in production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    attributeValue("x onerror=alert(1)", "1");
    attributeValue("x onerror=alert(1)", "1");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(`"x onerror=alert(1)"`);

    process.env.NODE_ENV = "production";
    attributeValue("y onerror=alert(1)", "1");
    attributeValue("onfocus", "alert(1)");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
