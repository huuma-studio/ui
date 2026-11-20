// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import type { Island } from "../../islands/islands.ts";

let runtime: typeof import("./mod.ts");
let hooks: typeof import("../../hooks/signal.ts");

beforeEach(async () => {
  vi.resetModules();
  runtime = await import("./mod.ts");
  hooks = await import("../../hooks/signal.ts");
  document.body.innerHTML = "";
  failing.value = false;
});

// Exercise the real server markers and the browser manifest, like launch does.
async function serve(element: JSX.Element, components: JSX.Component[]) {
  const islands: Island[] = [];
  const { renderToString } = await import("../server/render.ts");
  const { markIslands } = await import("../../islands/islands.ts");
  document.body.innerHTML = await renderToString(element, {
    beforeCreate: markIslands(
      components.map((island, index) => ({
        path: `island-${index}.client.js`,
        island,
      })),
      islands,
    ),
  });
  const manifest = islands.map((island) => {
    const node = island.node as JSX.ComponentNode<JSX.Component>;
    const { children: _, ...props } = node.props;
    return { fn: node.type, props, islandId: island.id };
  });
  return () => runtime.launch(manifest, {});
}

// A module-scope flag instead of a component that always throws: the island
// has to go through the server render fine, and fail on hydration only.
const failing = { value: false };

function BadIsland(): JSX.Element {
  if (failing.value) throw new Error("The bad island failed to hydrate");
  return <b data-id="bad">bad</b>;
}

describe("launch", () => {
  test("a failing island leaves the other islands hydrated", async () => {
    const controls = new Map<string, (value: number) => void>();
    function GoodIsland(): JSX.Element {
      const state = hooks.$signal(0);
      controls.set("good", (value) => state.set(value));
      return <button data-id="good">{`good:${state.get()}`}</button>;
    }

    const hydrate = await serve(
      <main>
        <BadIsland />
        <GoodIsland />
      </main>,
      [BadIsland, GoodIsland],
    );
    failing.value = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => hydrate()).not.toThrow();
      expect(error).toHaveBeenCalledOnce();
      // The bad island keeps the markup the server rendered for it.
      expect(document.querySelector('[data-id="bad"]')?.textContent).toBe("bad");
      // The good island is interactive: its signal still updates the DOM.
      controls.get("good")!(1);
      expect(document.querySelector('[data-id="good"]')?.textContent).toBe("good:1");
    } finally {
      error.mockRestore();
    }
  });

  test("a page without islands is hydrated as it is", async () => {
    const hydrate = await serve(
      <main>
        <p>static</p>
      </main>,
      [],
    );

    expect(() => hydrate()).not.toThrow();
  });
});
