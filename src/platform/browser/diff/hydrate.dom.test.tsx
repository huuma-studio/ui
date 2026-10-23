// @vitest-environment happy-dom
// Hydrating text the server wrote next to other text, or empty text, which
// the browser parses as one text node or as none (spec #132).
import { describe, expect, test } from "vite-plus/test";

import { jsxTemplate, type JSX } from "../../../jsx-runtime/mod.ts";
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

  test("keeps the next element after empty text", () => {
    const error = signal("");
    const fn = () => (
      <p>
        {error}
        <b>x</b>
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    const b = main.querySelector("b");
    hydrate(fn);

    expect(main.querySelector("b")).toBe(b);
    error.set("Failed");
    expect(markup(main)).toStrictEqual("<p>Failed<b>x</b></p>");
    expect(main.querySelector("b")).toBe(b);
  });

  test("keeps the elements after adjacent text, with both texts bound", () => {
    const a = signal("a");
    const b = signal("b");
    const fn = () => (
      <p>
        {a}
        {b}
        <i>i</i>
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    const i = main.querySelector("i");
    hydrate(fn);

    expect(main.querySelector("i")).toBe(i);
    a.set("A");
    expect(markup(main)).toStrictEqual("<p>Ab<i>i</i></p>");
    b.set("B");
    expect(markup(main)).toStrictEqual("<p>AB<i>i</i></p>");
    expect(main.querySelector("i")).toBe(i);
  });

  test("gives static and signal text next to each other a node each", () => {
    const name = signal("Ada");
    const fn = () => (
      <p>
        Hello {name}! <b>x</b>
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    const b = main.querySelector("b");
    hydrate(fn);

    const p = main.querySelector("p")!;
    expect([...p.childNodes].map((node) => node.textContent)).toStrictEqual([
      "Hello ",
      "Ada",
      "! ",
      "x",
    ]);
    name.set("Grace");
    expect(p.innerHTML).toStrictEqual("Hello Grace! <b>x</b>");
    expect(main.querySelector("b")).toBe(b);
  });

  test("binds empty text after the last element", () => {
    const hint = signal("");
    const fn = () => (
      <p>
        <b>x</b>
        {hint}
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    const b = main.querySelector("b");
    hydrate(fn);

    hint.set("!");
    expect(markup(main)).toStrictEqual("<p><b>x</b>!</p>");
    expect(main.querySelector("b")).toBe(b);
  });

  test("keeps the island's first element after empty text at its root", () => {
    const error = signal("");
    const fn = () => (
      <>
        {error}
        <b>x</b>
      </>
    );
    const main = serve(renderToStringSync(fn()));
    const b = main.querySelector("b");
    hydrate(fn);

    expect(main.querySelector("b")).toBe(b);
    error.set("Failed");
    expect(markup(main)).toStrictEqual("Failed<b>x</b>");
    expect(main.querySelector("b")).toBe(b);
  });

  test("keeps the next element after empty text, with raw HTML later on", () => {
    const error = signal("");
    const fn = () => (
      <p>
        {error}
        <b>x</b>
        {jsxTemplate(["y"])}
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    const b = main.querySelector("b");
    hydrate(fn);

    expect(main.querySelector("b")).toBe(b);
    error.set("Failed");
    expect(markup(main)).toStrictEqual("<p>Failed<b>x</b>y</p>");
  });

  // The server's text starts with the browser's: the rest of its node is
  // no text's, and goes.
  test.each([
    ["before an element", () => <b>x</b>, "<b>x</b>"],
    ["at the end", () => null, ""],
  ])("drops server text the browser doesn't render %s", (_, after, html) => {
    const text = signal("hello");
    const fn = () => (
      <p>
        {text}
        {after()}
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    const b = main.querySelector("b");
    text.set("he");
    hydrate(fn);

    expect(markup(main)).toStrictEqual(`<p>he${html}</p>`);
    expect(main.querySelector("b")).toBe(b);
    text.set("hey");
    expect(markup(main)).toStrictEqual(`<p>hey${html}</p>`);
  });

  test("drops server text the browser doesn't render at the island's root", () => {
    const text = signal("hello");
    const fn = () => <>{text}</>;
    const main = serve(renderToStringSync(fn()));
    text.set("");
    hydrate(fn);

    expect(markup(main)).toStrictEqual("");
    text.set("hey");
    expect(markup(main)).toStrictEqual("hey");
  });

  test("shows the browser's text when it differs from the server's", () => {
    const a = signal("a");
    const b = signal("b");
    const fn = () => (
      <p>
        {a}
        {b}
        <i>i</i>
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    a.set("x");
    hydrate(fn);

    expect(markup(main)).toStrictEqual("<p>xb<i>i</i></p>");
    b.set("y");
    expect(markup(main)).toStrictEqual("<p>xy<i>i</i></p>");
  });
});

// The values of the probe in spec #132: in the browser too, a signal shows
// its value like the same value written statically on the server.
const TEXT_VALUES: JSX.SignalValue[] = [
  null,
  undefined,
  false,
  true,
  0,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  "",
  "x",
];

describe("signal text in the browser", () => {
  test.each(TEXT_VALUES)("creates text for %o like the server renders it", (value) => {
    const fn = () => <p>{signal(value)}</p>;
    const main = serve("");
    hydrate(fn);

    expect(markup(main)).toStrictEqual(renderToStringSync(<p>{value}</p>));
  });

  test.each(TEXT_VALUES)("updates text to %o like the server renders it", (value) => {
    const text = signal<JSX.SignalValue>("before");
    const fn = () => <p>{text}</p>;
    const main = serve(renderToStringSync(fn()));
    hydrate(fn);

    text.set(value);
    expect(markup(main)).toStrictEqual(renderToStringSync(<p>{value}</p>));
    text.set("after");
    expect(markup(main)).toStrictEqual("<p>after</p>");
  });

  test.each(TEXT_VALUES)("hydrates text of %o and keeps the next element", (value) => {
    const text = signal<JSX.SignalValue>(value);
    const fn = () => (
      <p>
        {text}
        <b>x</b>
      </p>
    );
    const main = serve(renderToStringSync(fn()));
    const b = main.querySelector("b");
    hydrate(fn);

    expect(main.querySelector("b")).toBe(b);
    expect(markup(main)).toStrictEqual(
      renderToStringSync(
        <p>
          {value}
          <b>x</b>
        </p>,
      ),
    );
    text.set("y");
    expect(markup(main)).toStrictEqual("<p>y<b>x</b></p>");
    expect(main.querySelector("b")).toBe(b);
  });
});

describe("signal text when its component renders again", () => {
  /** Counts the writes to `node`'s text. */
  function countWrites(node: Node): { count: number } {
    const writes = { count: 0 };
    let prototype: object | null = node;
    let descriptor: PropertyDescriptor | undefined;
    while (prototype && !descriptor) {
      descriptor = Object.getOwnPropertyDescriptor(prototype, "textContent");
      prototype = Object.getPrototypeOf(prototype);
    }
    Object.defineProperty(node, "textContent", {
      get() {
        return descriptor!.get!.call(this);
      },
      set(value: string) {
        writes.count++;
        descriptor!.set!.call(this, value);
      },
    });
    return writes;
  }

  test.each(["hydrated", "created"])("stays subscribed once when %s", (how) => {
    const name = signal("Ada");
    const tick = signal(0);
    // Reads `tick` itself, so it renders again when `tick` changes.
    const fn = () => <p data-tick={String(tick.get())}>{name}</p>;
    const main = serve(how === "hydrated" ? renderToStringSync(fn()) : "");
    hydrate(fn);
    const text = main.querySelector("p")!.firstChild!;

    for (let i = 1; i <= 3; i++) tick.set(i);
    expect(main.querySelector("p")!.getAttribute("data-tick")).toStrictEqual("3");
    expect(main.querySelector("p")!.firstChild).toBe(text);

    const writes = countWrites(text);
    name.set("Grace");
    expect(markup(main)).toStrictEqual('<p data-tick="3">Grace</p>');
    expect(writes.count).toStrictEqual(1);
  });
});
