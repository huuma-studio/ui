import { describe, expect, test } from "vite-plus/test";
import { escape } from "./escape.ts";

describe(escape.name, () => {
  test("escapes each character with a meaning in HTML", () => {
    expect(escape("&")).toBe("&amp;");
    expect(escape("<")).toBe("&lt;");
    expect(escape(">")).toBe("&gt;");
    expect(escape('"')).toBe("&quot;");
    expect(escape("'")).toBe("&#39;");
  });

  test("escapes every occurrence in mixed text", () => {
    expect(escape(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });

  test("escapes the ampersand of existing entities", () => {
    expect(escape("&lt;b&gt;")).toBe("&amp;lt;b&amp;gt;");
  });

  test("leaves other text unchanged", () => {
    expect(escape("")).toBe("");
    expect(escape("þð — ✓ 42")).toBe("þð — ✓ 42");
  });
});
