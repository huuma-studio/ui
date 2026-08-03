import { assertEquals, assertThrows } from "@std/assert";

import { inlineJSON } from "./inline-json.ts";

Deno.test(inlineJSON.name, async (t) => {
  await t.step(
    "serializes a normal object exactly as JSON.stringify does",
    () => {
      const value = { a: 1, b: "text", c: true, d: null };
      assertEquals(inlineJSON(value), JSON.stringify(value));
    },
  );

  await t.step("serializes arrays and primitives like JSON.stringify", () => {
    assertEquals(inlineJSON([1, 2, 3]), "[1,2,3]");
    assertEquals(inlineJSON("plain"), '"plain"');
    assertEquals(inlineJSON(42), "42");
    assertEquals(inlineJSON(null), "null");
  });

  await t.step("escapes every literal < and contains no raw <", () => {
    const value = { html: "</script><script>" };
    const result = inlineJSON(value);

    assertEquals(result.includes("<"), false);
    assertEquals(
      result,
      JSON.stringify(value).replaceAll("<", "\\u003C"),
    );
  });

  await t.step("escapes </script> and <!-- without a literal <", () => {
    const value = { a: "</script>", b: "<!--" };
    const result = inlineJSON(value);

    assertEquals(result.includes("<"), false);
    assertEquals(result.includes("</script>"), false);
  });

  await t.step("escapes U+2028 and U+2029", () => {
    const value = { ls: "\u2028", ps: "\u2029", mix: "a\u2028b\u2029c" };
    const result = inlineJSON(value);

    assertEquals(result.includes("\u2028"), false);
    assertEquals(result.includes("\u2029"), false);
  });

  await t.step("round-trips losslessly for every escaping case", () => {
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

    assertEquals(JSON.parse(inlineJSON(value)), value);
  });

  await t.step("round-trips a normal object unchanged", () => {
    const value = { greeting: "Hello World!", count: 7 };
    assertEquals(JSON.parse(inlineJSON(value)), value);
  });

  await t.step("throws TypeError for unsupported top-level values", () => {
    assertThrows(() => inlineJSON(undefined), TypeError);
    assertThrows(() => inlineJSON(() => {}), TypeError);
    assertThrows(() => inlineJSON(Symbol("s")), TypeError);
  });

  await t.step("propagates JSON.stringify errors unchanged", () => {
    // Circular reference throws a TypeError from JSON.stringify.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assertThrows(() => inlineJSON(circular), TypeError);

    // BigInt throws a TypeError from JSON.stringify.
    assertThrows(() => inlineJSON(BigInt(1)), TypeError);
  });
});
