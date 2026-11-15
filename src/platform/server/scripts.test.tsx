import { describe, expect, test } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import { jsx } from "../../jsx-runtime/mod.ts";
import type { Island } from "../../islands/islands.ts";
import { Launch } from "./scripts.ts";
import { renderToString } from "./render.ts";

// A dummy island component so Launch can read a component node's props.
function IslandComponent(_props: JSX.ComponentProps): JSX.Element {
  return null;
}

const RUNTIME = { path: "runtime.js", name: "runtime" };
const ISLAND_SCRIPT = { path: "island.js", name: "island" };
const BODY = { runtime: RUNTIME, islands: [], entryPoints: [] };

// Build an Island whose node carries the given props (children are
// stripped by Launch, mirroring real island bootstrap).
function makeIsland(props: Record<string, unknown>, id = "island1"): Island {
  // Spread: jsx() mutates the props object it receives (it assigns
  // children), so a fresh copy keeps the caller's expected value pristine.
  return {
    id,
    path: ISLAND_SCRIPT.path,
    node: jsx(IslandComponent, { ...props }),
  };
}

// Render Launch to its full <script>...</script> string.
async function renderLaunch(
  islands: Island[],
  transferState?: unknown,
  nonce = "n0nce",
): Promise<string> {
  return await renderToString(
    Launch({
      body: BODY,
      nonce,
      islands,
      // deno-lint-ignore no-explicit-any
      transferState: transferState as any,
    }),
    {},
  );
}

// Extract the inner JavaScript source of the launch <script> element,
// i.e. the bytes the HTML tokenizer sees as script data.
function scriptSource(html: string): string {
  const open = html.indexOf(">");
  const close = html.lastIndexOf("</script>");
  return html.slice(open + 1, close);
}

// Read a balanced JSON object or array beginning at `start`, honoring
// string literals and escapes so that braces inside string data do not
// affect the depth count. Both payloads Launch emits (island props and
// the transfer state) are objects, so no primitive scanning is needed.
function parseJsonValue(source: string, start: number): unknown {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) i++;

  const valueStart = i;
  if (source[i] !== "{" && source[i] !== "[") {
    throw new Error(`expected a JSON object or array at ${start}, got ${source[i]}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        return JSON.parse(source.slice(valueStart, i + 1));
      }
    }
  }
  throw new Error(`unterminated JSON value at ${start}`);
}

// Extract and parse the `props: <json>` payload from an island entry.
function parseProps(source: string): Record<string, unknown> {
  const marker = "props: ";
  const idx = source.indexOf(marker);
  return parseJsonValue(source, idx + marker.length) as Record<string, unknown>;
}

// Extract and parse the `const transferState = <json>;` assignment.
function parseTransferState(source: string): unknown {
  const marker = "const transferState = ";
  const idx = source.indexOf(marker);
  return parseJsonValue(source, idx + marker.length);
}

// A script-data payload is safe when no literal `<` remains inside it:
// every sequence that can terminate or change the parser state of an
// inline script element begins with `<`.
function assertScriptDataSafe(inner: string): void {
  expect(
    inner.includes("<"),
    `expected no literal "<" in serialized script data: ${inner}`,
  ).toStrictEqual(false);
}

describe("Launch inline script serialization", () => {
  test("renders exactly one literal </script> for the launch element", async () => {
    const html = await renderLaunch([makeIsland({ greeting: "</script>" })], { note: "</script>" });
    // Only the element's own closing tag should appear.
    expect(html.split("</script>").length - 1).toStrictEqual(1);
  });

  test("escapes </script> in a prop and keeps the payload safe", async () => {
    const html = await renderLaunch([makeIsland({ danger: "</script>" })]);
    expect(html, "expected </script> to be escaped in the serialized props").toContain(
      "\\u003C/script>",
    );
    assertScriptDataSafe(scriptSource(html));
  });

  test("covers <!-- followed by <script in prop data", async () => {
    const value = { a: "<!--<script>", b: "<!--", c: "<script>" };
    const html = await renderLaunch([makeIsland(value)]);
    assertScriptDataSafe(scriptSource(html));
    expect(parseProps(scriptSource(html))).toStrictEqual(value);
  });

  test("covers U+2028 and U+2029 in prop data", async () => {
    const value = { ls: "\u2028", ps: "\u2029", mix: "x\u2028y\u2029z" };
    const html = await renderLaunch([makeIsland(value)]);
    const src = scriptSource(html);
    expect(src.includes("\u2028")).toStrictEqual(false);
    expect(src.includes("\u2029")).toStrictEqual(false);
    expect(parseProps(src)).toStrictEqual(value);
  });

  test("round-trips props exactly after JSON.parse", async () => {
    const value = {
      close: "</script>",
      comment: "<!--",
      open: "<script>",
      combined: "<!--<script></script>",
      ls: "\u2028",
      ps: "\u2029",
      nested: { deep: "</script>\u2028<!--" },
      arr: ["</script>", "\u2029", "<!--<script>"],
      normal: "plain",
    };
    const src = scriptSource(await renderLaunch([makeIsland(value)]));
    expect(parseProps(src)).toStrictEqual(value);
  });

  test("leaves normal prop serialization unchanged from previous output", async () => {
    const html = await renderLaunch([makeIsland({ greeting: "Hello World!" })]);
    const src = scriptSource(html);
    expect(src).toContain(`props: {"greeting":"Hello World!"}`);
    expect(parseProps(src)).toStrictEqual({ greeting: "Hello World!" });
  });

  test("escapes </script> in transfer state", async () => {
    const html = await renderLaunch([makeIsland({ a: 1 })], { note: "</script>" });
    expect(html).toContain("\\u003C/script>");
    assertScriptDataSafe(scriptSource(html));
  });

  test("covers <!-- followed by <script in transfer state", async () => {
    const value = { a: "<!--<script>", b: "<!--", c: "<script>" };
    const html = await renderLaunch([makeIsland({ a: 1 })], value);
    assertScriptDataSafe(scriptSource(html));
    expect(parseTransferState(scriptSource(html))).toStrictEqual(value);
  });

  test("covers U+2028 and U+2029 in transfer state", async () => {
    const value = { ls: "\u2028", ps: "\u2029", mix: "x\u2028y\u2029z" };
    const html = await renderLaunch([makeIsland({ a: 1 })], value);
    const src = scriptSource(html);
    expect(src.includes("\u2028")).toStrictEqual(false);
    expect(src.includes("\u2029")).toStrictEqual(false);
    expect(parseTransferState(src)).toStrictEqual(value);
  });

  test("round-trips transfer state exactly after JSON.parse", async () => {
    const value = {
      close: "</script>",
      comment: "<!--",
      open: "<script>",
      combined: "<!--<script></script>",
      ls: "\u2028",
      ps: "\u2029",
      nested: { deep: "</script>\u2028<!--" },
      arr: ["</script>", "\u2029", "<!--<script>"],
      normal: "plain",
    };
    const src = scriptSource(await renderLaunch([makeIsland({ a: 1 })], value));
    expect(parseTransferState(src)).toStrictEqual(value);
  });

  test("dangerous props and transfer state together add no literal </script>", async () => {
    const html = await renderLaunch([makeIsland({ danger: "</script>" })], {
      danger: "</script><!--<script>",
    });
    expect(html.split("</script>").length - 1).toStrictEqual(1);
    assertScriptDataSafe(scriptSource(html));
    const src = scriptSource(html);
    expect(parseProps(src)).toStrictEqual({ danger: "</script>" });
    expect(parseTransferState(src)).toStrictEqual({
      danger: "</script><!--<script>",
    });
  });

  test("absent transfer state still emits {} and preserves launch structure", async () => {
    const html = await renderLaunch([makeIsland({ a: 1 })]);
    const src = scriptSource(html);
    expect(src).toContain("const transferState = {};");
    expect(src).toContain('import { launch } from "/runtime.js";');
    expect(src).toContain('import $I1 from "/island.js";');
    expect(src).toContain("launch([");
    expect(src).toContain("], transferState);");
  });
});

describe("Launch script paths", () => {
  test("loads URLs as they are, e.g. from a CDN in Vite's base", async () => {
    const src = scriptSource(
      await renderToString(
        Launch({
          body: {
            ...BODY,
            runtime: { path: "https://cdn.example/assets/runtime.js", name: "runtime" },
          },
          islands: [{ ...makeIsland({ a: 1 }), path: "https://cdn.example/assets/island.js" }],
        }),
        {},
      ),
    );
    expect(src).toContain('import { launch } from "https://cdn.example/assets/runtime.js";');
    expect(src).toContain('import $I1 from "https://cdn.example/assets/island.js";');
    expect(src).toContain('path: "https://cdn.example/assets/island.js"');
  });
});
