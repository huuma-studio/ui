// @vitest-environment happy-dom
// Hydrating server-rendered text.
import { describe, expect, test } from "vite-plus/test";

import type { JSX } from "../../../jsx-runtime/mod.ts";
import { signal } from "../../../signal/mod.ts";
import { renderToStringSync } from "../../server/render.ts";
import { launch } from "../mod.ts";

/** Puts `html` on the page as the island `a1`. */
function serve(html: string): HTMLElement {
  document.body.innerHTML = `<main><!-- start_island_a1 -->${html}<!--end_island_a1 --></main>`;
  return document.querySelector("main")!;
}

/** Hydrates the island `a1` as `fn`, like a page's `Launch` script. */
function hydrate(fn: JSX.Component): void {
  launch([{ fn, props: {}, islandId: "a1" }], {});
}

/** The markup in `main`, without the island's comments. */
function markup(main: HTMLElement): string {
  return main.innerHTML.replace(/<!--.*?-->/g, "");
}

describe("hydrating text", () => {
  test("keeps text that matches the server's bound to its signal", () => {
    const name = signal("Ada");
    const fn = () => (
      <p>
        <b>x</b>
        {name}
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    const text = main.querySelector("p")!.lastChild;
    hydrate(fn);

    name.set("Grace");
    expect(markup(main)).toStrictEqual("<p><b>x</b>Grace</p>");
    expect(main.querySelector("p")!.lastChild).toBe(text);
  });
});
