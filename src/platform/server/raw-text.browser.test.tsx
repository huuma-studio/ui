// <script> and <style> content from the server, parsed by a real browser
// (headless Chromium): the element ends where it should, nothing after it is
// swallowed or injected, and the code still means the same. String
// comparisons can't show this: the HTML parser has states that only a
// browser applies. Skipped without Chromium, except in CI (test/browser.ts).
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import type { Browser, Page } from "playwright-core";

import { findChromium, launchChromium } from "../../../test/browser.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";
import { renderToStringSync } from "./render.ts";

const chromium = findChromium();

// A value whose text contains every sequence that could end a script early.
const TRICKY =
  '</script><!--<script></SCRIPT><!--<SCRIPT>--><img src=x onerror="window.injected=1">';

describe.skipIf(chromium === undefined)("<script> and <style> in a browser", () => {
  let browser: Browser;
  let page: Page | undefined;
  beforeAll(async () => {
    browser = await launchChromium(chromium!);
  });
  afterAll(async () => {
    await browser?.close();
  });

  // Loads `element` followed by a paragraph, as the server renders them, in
  // a fresh page, so nothing a previous test injected is left in `window`.
  async function load(element: JSX.Element) {
    await page?.close();
    page = await browser.newPage();
    await page.setContent(
      `<body>${renderToStringSync(<main>{element}</main>)}<p id="after">after</p></body>`,
    );
    return page.evaluate(() => ({
      elements: [...document.querySelector("main")!.children].map((e) => e.tagName),
      after: document.getElementById("after")?.textContent ?? null,
      injected: "injected" in window || document.querySelectorAll("img").length > 0,
    }));
  }

  test("a script's text can't end it early, and runs as written", async () => {
    const result = await load(<script>{`window.value = ${JSON.stringify(TRICKY)};`}</script>);
    expect(result).toStrictEqual({ elements: ["SCRIPT"], after: "after", injected: false });
    expect(
      await page!.evaluate(() => (window as unknown as { value: string }).value),
    ).toStrictEqual(TRICKY);
  });

  test("JSON in a script parses to the same value", async () => {
    const data = { name: TRICKY, nested: ["<!--<script>"] };
    const result = await load(
      <script type="application/ld+json" id="data">
        {JSON.stringify(data)}
      </script>,
    );
    expect(result).toStrictEqual({ elements: ["SCRIPT"], after: "after", injected: false });
    const parsed = await page!.evaluate(() =>
      JSON.parse(document.getElementById("data")!.textContent!),
    );
    expect(parsed).toStrictEqual(data);
  });

  test("a closing tag split across children can't end the element", async () => {
    expect(
      await load(
        <style>
          {"</sty"}
          {'le><img src=x onerror="window.injected=1">'}
        </style>,
      ),
    ).toStrictEqual({ elements: ["STYLE"], after: "after", injected: false });
    expect(
      await load(
        <script>
          {"</scr"}
          {'ipt><img src=x onerror="window.injected=1">'}
        </script>,
      ),
    ).toStrictEqual({ elements: ["SCRIPT"], after: "after", injected: false });
  });

  test("inside <svg>, style text can't add elements, and its CSS applies", async () => {
    const untrusted = '<img src=x onerror="window.injected=1">';
    const result = await load(
      <svg>
        <style>
          <>{`#box { fill: rgb(4, 5, 6) } svg > #box {} ${untrusted}`}</>
        </style>
        <rect id="box" width="10" height="10" />
      </svg>,
    );
    expect(result).toStrictEqual({ elements: ["svg"], after: "after", injected: false });
    expect(
      await page!.evaluate(() => getComputedStyle(document.getElementById("box")!).fill),
    ).toStrictEqual("rgb(4, 5, 6)");
  });

  test("inside <foreignObject>, style text is raw again", async () => {
    const result = await load(
      <svg>
        <foreignObject>
          <style>{"main > svg #inner { color: rgb(7, 8, 9) }"}</style>
          <p id="inner">inner</p>
        </foreignObject>
      </svg>,
    );
    expect(result).toStrictEqual({ elements: ["svg"], after: "after", injected: false });
    expect(
      await page!.evaluate(() => getComputedStyle(document.getElementById("inner")!).color),
    ).toStrictEqual("rgb(7, 8, 9)");
  });

  test("a style's text can't end it early, and its CSS applies", async () => {
    const result = await load(
      <style>{`#after { color: rgb(1, 2, 3); } /* </style><img src=x onerror="window.injected=1"> */`}</style>,
    );
    expect(result).toStrictEqual({ elements: ["STYLE"], after: "after", injected: false });
    expect(
      await page!.evaluate(() => getComputedStyle(document.getElementById("after")!).color),
    ).toStrictEqual("rgb(1, 2, 3)");
  });
});
