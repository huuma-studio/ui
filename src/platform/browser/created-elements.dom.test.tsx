// @vitest-environment happy-dom
// Elements an island creates or updates in the browser end up as the
// server renders them: a select's value, raw HTML and HTML inside an SVG.
// In a real browser too: "created and updated elements" in
// src/vite/browser.test.ts.
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import type { Island } from "../../islands/islands.ts";
import type { WritableSignal } from "../../signal/mod.ts";

let runtime: typeof import("./mod.ts");
let hooks: typeof import("../../hooks/signal.ts");
let renderToString: typeof import("../server/render.ts").renderToString;
let markIslands: typeof import("../../islands/islands.ts").markIslands;

beforeEach(async () => {
  vi.resetModules();
  runtime = await import("./mod.ts");
  hooks = await import("../../hooks/signal.ts");
  ({ renderToString } = await import("../server/render.ts"));
  ({ markIslands } = await import("../../islands/islands.ts"));
  document.body.innerHTML = "";
});

async function hydrate(element: JSX.Element, components: JSX.Component[]) {
  const islands: Island[] = [];
  document.body.innerHTML = await renderToString(element, {
    beforeCreate: markIslands(
      components.map((island, index) => ({ path: `island-${index}.client.js`, island })),
      islands,
    ),
  });
  const manifest = islands.map((island) => {
    const node = island.node as JSX.ComponentNode<JSX.Component>;
    const { children: _, ...props } = node.props;
    return { fn: node.type, props, islandId: island.id };
  });
  runtime.launch(manifest, {});
  await Promise.resolve();
}

// An island that renders `view(step)`, hydrated at step 0.
async function island(view: (step: number) => JSX.Element): Promise<WritableSignal<number>> {
  let step!: WritableSignal<number>;
  function Steps(): JSX.Element {
    step = hooks.$signal(0);
    return <div id="island">{view(step.get())}</div>;
  }
  await hydrate(<Steps />, [Steps]);
  return step;
}

const select = () => document.querySelector("select")!;
const selected = () => [...select().options].filter((o) => o.selected).map((o) => o.value);

describe("a select's value", () => {
  test("selects its option in a select the browser creates", async () => {
    const step = await island((s) =>
      s ? (
        <select value="b">
          <option value="a">A</option>
          <option value="b">B</option>
          <option>c</option>
        </select>
      ) : null,
    );
    step.set(1);
    expect(select().value).toBe("b");
    expect(selected()).toStrictEqual(["b"]);
  });

  test("selects an option by its text, and inside an optgroup or a component", async () => {
    function Options(): JSX.Element {
      return (
        <optgroup label="more">
          <option>c</option>
        </optgroup>
      );
    }
    const step = await island((s) =>
      s ? (
        <select value="c">
          <option value="a">A</option>
          <Options />
        </select>
      ) : null,
    );
    step.set(1);
    expect(select().value).toBe("c");
  });

  test("selects an option added in the same update", async () => {
    const step = await island((s) => (
      <select value={s ? "c" : "a"}>
        <option value="a">A</option>
        <option value="b">B</option>
        {s ? <option value="c">C</option> : null}
      </select>
    ));
    expect(select().value).toBe("a");
    step.set(1);
    expect(select().value).toBe("c");
  });

  test("changes the selection in an update", async () => {
    const step = await island((s) => (
      <select value={s ? "b" : "a"}>
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
    ));
    step.set(1);
    expect(selected()).toStrictEqual(["b"]);
    step.set(0);
    expect(selected()).toStrictEqual(["a"]);
  });

  test("selects every option with the value in a multiple select", async () => {
    const step = await island((s) =>
      s ? (
        <select multiple value="b">
          <option value="a">A</option>
          <option value="b">B</option>
          <option value="b">B again</option>
        </select>
      ) : null,
    );
    step.set(1);
    expect(selected()).toStrictEqual(["b", "b"]);
  });

  test("with no such option deselects them, for the browser's default", async () => {
    const step = await island((s) => (
      <select multiple value={s ? "x" : "b"}>
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
    ));
    expect(selected()).toStrictEqual(["b"]);
    step.set(1);
    expect(selected()).toStrictEqual([]);
  });

  test("still sets the value of an input and a textarea", async () => {
    const step = await island((s) =>
      s ? (
        <p>
          <input value="typed" />
          <textarea value="text" />
        </p>
      ) : null,
    );
    step.set(1);
    expect(document.querySelector("input")!.value).toBe("typed");
    expect(document.querySelector("textarea")!.value).toBe("text");
  });
});

describe("raw HTML", () => {
  const raw = () => document.querySelector("#raw")!;

  test("is cleared by an empty string", async () => {
    const step = await island((s) => (
      <p id="raw" dangerouslySetInnerHTML={{ __html: s ? "" : "<b>old</b>" }} />
    ));
    expect(raw().innerHTML).toBe("<b>old</b>");
    step.set(1);
    expect(raw().innerHTML).toBe("");
    step.set(0);
    expect(raw().innerHTML).toBe("<b>old</b>");
  });

  test("goes when the element renders children instead", async () => {
    const step = await island((s) =>
      s ? (
        <p id="raw">
          <i>new</i>
        </p>
      ) : (
        <p id="raw" dangerouslySetInnerHTML={{ __html: "<b>old</b>" }} />
      ),
    );
    step.set(1);
    expect(raw().innerHTML).toBe("<i>new</i>");
    step.set(0);
    expect(raw().innerHTML).toBe("<b>old</b>");
  });
});

describe("inside an SVG", () => {
  const SVG = "http://www.w3.org/2000/svg";
  const HTML = "http://www.w3.org/1999/xhtml";
  const namespace = (selector: string) => document.querySelector(selector)!.namespaceURI;

  test("the children of a foreignObject are HTML elements", async () => {
    const step = await island((s) =>
      s ? (
        <svg>
          <g>
            <circle id="circle" />
          </g>
          <foreignObject id="foreign">
            <div id="html">
              <span id="nested">text</span>
              <svg id="inner">
                <path id="path" />
              </svg>
            </div>
          </foreignObject>
        </svg>
      ) : null,
    );
    step.set(1);
    expect(namespace("#circle")).toBe(SVG);
    expect(namespace("#foreign")).toBe(SVG);
    expect(namespace("#html")).toBe(HTML);
    expect(namespace("#nested")).toBe(HTML);
    expect(namespace("#inner")).toBe(SVG);
    expect(namespace("#path")).toBe(SVG);
  });

  test("an element added to a hydrated foreignObject is an HTML element", async () => {
    const step = await island((s) => (
      <svg>
        <foreignObject>{s ? <div id="added">added</div> : null}</foreignObject>
      </svg>
    ));
    step.set(1);
    expect(namespace("#added")).toBe(HTML);
  });
});
