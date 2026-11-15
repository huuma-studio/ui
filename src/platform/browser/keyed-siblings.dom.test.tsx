// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import type { Island } from "../../islands/islands.ts";

let runtime: typeof import("./mod.ts");
let hooks: typeof import("../../hooks/signal.ts");
let signals: typeof import("../../signal/mod.ts");
let renderToString: typeof import("../server/render.ts").renderToString;
let markIslands: typeof import("../../islands/islands.ts").markIslands;

// A fresh runtime and an empty page, also for each list of the random test.
async function load() {
  vi.resetModules();
  runtime = await import("./mod.ts");
  hooks = await import("../../hooks/signal.ts");
  signals = await import("../../signal/mod.ts");
  ({ renderToString } = await import("../server/render.ts"));
  ({ markIslands } = await import("../../islands/islands.ts"));
  document.body.innerHTML = "";
}

beforeEach(load);

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

describe("a keyed element replaced by one without a key", () => {
  const EDITOR = "<div><b>editor</b><span>footer</span></div>";
  const VIEW = "<div><span>view</span><span>footer</span></div>";

  // Both ways: the server renders either one.
  test.each([
    { name: "from the keyed element", first: true },
    { name: "from the element without a key", first: false },
  ])("keeps the sibling without a key apart, $name", async ({ first }) => {
    const editing = signals.signal(first);
    function Editor(): JSX.Element {
      return (
        <div>
          {editing.get() ? <b key="editor">editor</b> : <span>view</span>}
          <span>footer</span>
        </div>
      );
    }
    await hydrate(<Editor />, [Editor]);
    const html = () => document.querySelector("div")!.outerHTML;
    expect(html()).toBe(first ? EDITOR : VIEW);

    for (const next of [!first, first, !first]) {
      editing.set(next);
      expect(html(), `editing: ${next}`).toBe(next ? EDITOR : VIEW);
    }
  });
});

// The same numbers on every run, so a failure names a seed that fails again.
function random(seed: number): () => number {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

// Some of the ids below `pool`, in a random order.
function randomList(next: () => number, pool: number): number[] {
  const ids = Array.from({ length: pool }, (_, id) => id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.floor(next() * (pool + 1)));
}

describe("a list updated at random", () => {
  const SEEDS = 40;
  const UPDATES = 12;
  const POOL = 7;

  test.each([
    { name: "every item keyed", item: "keyed" },
    { name: "every item a keyed component with a signal", item: "stateful" },
    { name: "items with and without a key, between siblings without", item: "mixed" },
  ] as const)("shows its items in order: $name", async ({ item }) => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      await load();
      const next = random(seed);
      const first = randomList(next, POOL);
      const items = signals.signal(first);

      // `key` is for the list: the component doesn't read it.
      function Stateful({ id }: { id: number; key?: number }): JSX.Element {
        const text = hooks.$signal(`item ${id}`);
        return <li data-id={id}>{text.get()}</li>;
      }
      function List(): JSX.Element {
        return (
          <ul>
            {item === "mixed" ? <li data-id="head">head</li> : null}
            {items.get().map((id) => {
              if (item === "stateful") return <Stateful key={id} id={id} />;
              // Mixed: the odd ids have a key, the even ones don't.
              if (item === "mixed" && id % 2 === 0) return <li data-id={id}>{`item ${id}`}</li>;
              return (
                <li key={id} data-id={id}>
                  {`item ${id}`}
                </li>
              );
            })}
            {item === "mixed" ? <li data-id="tail">tail</li> : null}
          </ul>
        );
      }

      // Each <li>'s id and text, as the list should show them.
      const expected = (list: number[]) => [
        ...(item === "mixed" ? ["head: head"] : []),
        ...list.map((id) => `${id}: item ${id}`),
        ...(item === "mixed" ? ["tail: tail"] : []),
      ];
      const shown = () =>
        [...document.querySelectorAll("li")].map(
          (li) => `${li.getAttribute("data-id")}: ${li.textContent}`,
        );

      await hydrate(<List />, [List]);
      expect(shown(), `seed ${seed}, hydrated ${JSON.stringify(first)}`).toStrictEqual(
        expected(first),
      );

      let previous = first;
      for (let update = 0; update < UPDATES; update++) {
        const list = randomList(next, POOL);
        items.set(list);
        expect(
          shown(),
          `seed ${seed}: ${JSON.stringify(previous)} to ${JSON.stringify(list)}`,
        ).toStrictEqual(expected(list));
        previous = list;
      }
    }
  });
});
