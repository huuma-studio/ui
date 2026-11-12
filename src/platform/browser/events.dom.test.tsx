// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import type { Island } from "../../islands/islands.ts";

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

describe("event listeners run in a batch", () => {
  test("a listener that sets several signals renders the component once", async () => {
    let renders = 0;
    function Name(): JSX.Element {
      const first = hooks.$signal("Ada");
      const last = hooks.$signal("Lovelace");
      renders++;
      return (
        <button
          on-click={() => {
            first.set("Grace");
            last.set("Hopper");
          }}
        >
          {first.get()} {last.get()}
        </button>
      );
    }
    await hydrate(<Name />, [Name]);
    renders = 0;

    document.querySelector("button")!.click();

    expect(document.querySelector("button")!.textContent).toBe("Grace Hopper");
    expect(renders).toBe(1);
  });

  test("a listener reads the new value of a computed after it sets a signal", async () => {
    const seen: number[] = [];
    function Counter(): JSX.Element {
      const count = hooks.$signal(1);
      const double = hooks.$computed(() => count.get() * 2);
      return (
        <button
          on-click={() => {
            count.set(count.get() + 1);
            seen.push(double.get());
          }}
        >
          {double.get()}
        </button>
      );
    }
    await hydrate(<Counter />, [Counter]);

    document.querySelector("button")!.click();
    document.querySelector("button")!.click();

    expect(seen).toStrictEqual([4, 6]);
    expect(document.querySelector("button")!.textContent).toBe("6");
  });

  test("the DOM updates when the listener returns, not after each set()", async () => {
    const seen: (string | null | undefined)[] = [];
    function Dialog(): JSX.Element {
      const open = hooks.$signal(false);
      return (
        <div>
          <button
            on-click={() => {
              open.set(true);
              seen.push(document.querySelector("input")?.localName);
            }}
          >
            open
          </button>
          {open.get() ? <input /> : null}
        </div>
      );
    }
    await hydrate(<Dialog />, [Dialog]);

    document.querySelector("button")!.click();

    expect(seen).toStrictEqual([undefined]);
    expect(document.querySelector("input")).not.toBeNull();
  });

  test("the listener gets the event and the element, and is removed with its element's update", async () => {
    const seen: string[] = [];
    function Toggle(): JSX.Element {
      const on = hooks.$signal(false);
      return on.get() ? (
        <button>on</button>
      ) : (
        <button
          on-click={function (this: HTMLButtonElement, event: Event) {
            seen.push(`${event.type} ${this.localName}`);
            on.set(true);
          }}
        >
          off
        </button>
      );
    }
    await hydrate(<Toggle />, [Toggle]);

    document.querySelector("button")!.click();
    document.querySelector("button")!.click();

    expect(document.querySelector("button")!.textContent).toBe("on");
    expect(seen).toStrictEqual(["click button"]);
  });
});
