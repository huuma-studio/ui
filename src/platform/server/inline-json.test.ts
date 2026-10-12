import { assert, describe, expect, test } from "vite-plus/test";

import { inlineJSON } from "./inline-json.ts";

describe(inlineJSON.name, () => {
  test(
    "serializes a normal object exactly as JSON.stringify does",
    () => {
      const value = { a: 1, b: "text", c: true, d: null };
      expect(inlineJSON(value)).toStrictEqual(JSON.stringify(value));
    },
  );

  test("serializes arrays and primitives like JSON.stringify", () => {
    expect(inlineJSON([1, 2, 3])).toStrictEqual("[1,2,3]");
    expect(inlineJSON("plain")).toStrictEqual('"plain"');
    expect(inlineJSON(42)).toStrictEqual("42");
    expect(inlineJSON(null)).toStrictEqual("null");
  });

  test("escapes every literal < and contains no raw <", () => {
    const value = { html: "</script><script>" };
    const result = inlineJSON(value);

    expect(result.includes("<")).toStrictEqual(false);
    expect(result).toStrictEqual(JSON.stringify(value).replaceAll("<", "\\u003C"));
  });

  test("escapes </script> and <!-- without a literal <", () => {
    const value = { a: "</script>", b: "<!--" };
    const result = inlineJSON(value);

    expect(result.includes("<")).toStrictEqual(false);
    expect(result.includes("</script>")).toStrictEqual(false);
  });

  test("escapes U+2028 and U+2029", () => {
    const value = { ls: "\u2028", ps: "\u2029", mix: "a\u2028b\u2029c" };
    const result = inlineJSON(value);

    expect(result.includes("\u2028")).toStrictEqual(false);
    expect(result.includes("\u2029")).toStrictEqual(false);
  });

  test("round-trips losslessly for every escaping case", () => {
    const value = {
      close: "</script>",
      comment: "<!--",
      open: "<script>",
      combined: "<!--<script></script>",
      ls: "\u2028",
      ps: "\u2029",
      nested: { deep: "</script>\u2028<!--" },
      arr: ["</script>", "\u2029", "<!--<script>"],
      normal: "plain text with no special chars",
    };

    expect(JSON.parse(inlineJSON(value))).toStrictEqual(value);
  });

  test("round-trips a normal object unchanged", () => {
    const value = { greeting: "Hello World!", count: 7 };
    expect(JSON.parse(inlineJSON(value))).toStrictEqual(value);
  });

  test("throws TypeError for unsupported top-level values", () => {
    assert.throws(() => inlineJSON(undefined), TypeError);
    assert.throws(() => inlineJSON(() => {}), TypeError);
    assert.throws(() => inlineJSON(Symbol("s")), TypeError);
  });

  test("propagates JSON.stringify errors unchanged", () => {
    // Circular reference throws a TypeError from JSON.stringify.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(() => inlineJSON(circular), TypeError);

    // BigInt throws a TypeError from JSON.stringify.
    assert.throws(() => inlineJSON(BigInt(1)), TypeError);
  });
});
