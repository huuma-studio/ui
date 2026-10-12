// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";

let runtime: typeof import("./mod.ts");
let hooks: typeof import("../../hooks/signal.ts");
beforeEach(async () => {
  // A fresh runtime per test (it records the page's islands), and the
  // hooks of that runtime's module instances.
  vi.resetModules();
  runtime = await import("./mod.ts");
  hooks = await import("../../hooks/signal.ts");
});

const COUNTER = "/app/counter.client.tsx";

function Counter({ start = 0 }: { start?: number }): JSX.Element {
  const count = hooks.$signal(start);
  return <button on-click={() => count.set(count.get() + 1)}>{count}</button>;
}

// The edited module's component: new markup, same hooks.
function EditedCounter({ start = 0 }: { start?: number }): JSX.Element {
  const count = hooks.$signal(start);
  return <button on-click={() => count.set(count.get() + 1)}>Count: {count}</button>;
}

/** Hydrates server-rendered islands like a page's `Launch` script. */
function launch(html: string, islands: { id: string; fn: JSX.Component; path: string }[]) {
  document.body.innerHTML = html;
  runtime.launch(
    islands.map(({ id, fn, path }) => ({ fn, path, props: { start: 1 }, islandId: id })),
    {},
  );
}

function island(id: string, html: string): string {
  return `<!-- start_island_${id} -->${html} <!--end_island_${id} -->`;
}

function click(selector: string, times = 1) {
  for (let i = 0; i < times; i++) document.querySelector<HTMLElement>(selector)!.click();
}

describe(`launch() and hotReplaceIsland()`, () => {
  test("replace the island's component in place, starting over", () => {
    launch(`<main><h1>Home</h1>${island("a1", "<button>1</button>")}<p>Footer</p></main>`, [
      { id: "a1", fn: Counter, path: COUNTER },
    ]);
    click("button", 2);
    expect(document.querySelector("button")!.textContent).toStrictEqual("3");

    expect(runtime.hotReplaceIsland(COUNTER, EditedCounter)).toStrictEqual(true);

    // At the same place, with its initial state, still interactive.
    const main = document.querySelector("main")!;
    expect(main.querySelectorAll("button")).toHaveLength(1);
    expect(main.firstElementChild!.outerHTML).toStrictEqual("<h1>Home</h1>");
    expect(main.lastElementChild!.outerHTML).toStrictEqual("<p>Footer</p>");
    expect(document.querySelector("button")!.textContent).toStrictEqual("Count: 1");
    click("button");
    expect(document.querySelector("button")!.textContent).toStrictEqual("Count: 2");
  });

  test("keep the island's state if asked to", () => {
    launch(`<main><h1>Home</h1>${island("a1", "<button>1</button>")}<p>Footer</p></main>`, [
      { id: "a1", fn: Counter, path: COUNTER },
    ]);
    click("button", 2);
    const button = document.querySelector("button");

    expect(runtime.hotReplaceIsland(COUNTER, EditedCounter, { keepState: true })).toStrictEqual(
      true,
    );

    // The same signal, rendered by the new component into the same element.
    expect(document.querySelector("button")).toBe(button);
    expect(button!.textContent).toStrictEqual("Count: 3");
    click("button");
    expect(button!.textContent).toStrictEqual("Count: 4");
    // A second update keeps it too.
    runtime.hotReplaceIsland(COUNTER, Counter, { keepState: true });
    expect(button!.textContent).toStrictEqual("4");
  });

  test("keep typed input and focus if asked to", () => {
    function Form(): JSX.Element {
      return (
        <form>
          <input name="title" />
        </form>
      );
    }
    function EditedForm(): JSX.Element {
      return (
        <form>
          <input name="title" />
          <button>Save</button>
        </form>
      );
    }
    launch(`<main>${island("f1", '<form><input name="title"></form>')}</main>`, [
      { id: "f1", fn: Form, path: "/app/form.client.tsx" },
    ]);
    const input = document.querySelector("input")!;
    input.value = "Milk";
    input.focus();

    runtime.hotReplaceIsland("/app/form.client.tsx", EditedForm, { keepState: true });

    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toStrictEqual("Milk");
    expect(document.activeElement).toBe(input);
    expect(document.querySelector("form button")!.textContent).toStrictEqual("Save");
  });

  test("leave islands of other modules alone", () => {
    function Other(): JSX.Element {
      const count = hooks.$signal(1);
      return <output on-click={() => count.set(count.get() + 1)}>{count}</output>;
    }
    launch(
      `<main>${island("a1", "<button>1</button>")}${island("b1", "<output>1</output>")}</main>`,
      [
        { id: "a1", fn: Counter, path: COUNTER },
        { id: "b1", fn: Other, path: "/app/other.client.tsx" },
      ],
    );
    click("output", 2);

    runtime.hotReplaceIsland(COUNTER, EditedCounter);
    expect(document.querySelector("output")!.textContent).toStrictEqual("3");
  });

  test("decline a component another island renders", () => {
    function Wrapper(): JSX.Element {
      return (
        <div>
          <Counter start={5} />
        </div>
      );
    }
    launch(`<main>${island("w1", `<div>${island("a1", "<button>5</button>")}</div>`)}</main>`, [
      { id: "w1", fn: Wrapper, path: "/app/wrapper.client.tsx" },
      { id: "a1", fn: Counter, path: COUNTER },
    ]);

    expect(runtime.hotReplaceIsland(COUNTER, EditedCounter)).toStrictEqual(false);
    expect(document.querySelector("button")!.textContent).toStrictEqual("5");
  });
});
