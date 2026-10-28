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

function Frame({ children }: JSX.ComponentProps): JSX.Element {
  return <section>{children}</section>;
}

function Counter({ label, children }: JSX.ComponentProps & { label: string }): JSX.Element {
  const count = hooks.$signal(0);
  return (
    <article data-counter={label}>
      <button on-click={() => count.set(count.get() + 1)}>{count}</button>
      {children}
    </article>
  );
}

async function serve(element: JSX.Element) {
  const islands: Island[] = [];
  // Use real SSR markers and props, so these tests exercise both halves of
  // the hydration contract rather than hand-authoring idealized HTML.
  document.body.innerHTML = await renderToString(element, {
    beforeCreate: markIslands(
      [
        { path: "frame.client.js", island: Frame },
        { path: "counter.client.js", island: Counter },
      ],
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

describe("nested island children from SSR", () => {
  test.each([1, 2, 3])(
    "hydrates %i sibling islands inside a static slot wrapper",
    async (count) => {
      const labels = Array.from({ length: count }, (_, i) => `child-${i}`);
      const hydrate = await serve(
        <main>
          <Frame>
            <div data-slot="">
              <p>before</p>
              {labels.map((label) => (
                <Counter label={label}>
                  <span data-label={label}>{label}</span>
                </Counter>
              ))}
              <p>after</p>
            </div>
          </Frame>
          <Counter label="following">
            <span data-label="following">following</span>
          </Counter>
        </main>,
      );
      const originalButtons = [...document.querySelectorAll("button")];

      expect(hydrate).not.toThrow();
      expect(
        [...document.querySelectorAll("[data-counter]")].map((node) =>
          node.getAttribute("data-counter"),
        ),
      ).toStrictEqual([...labels, "following"]);
      expect(
        [...document.querySelectorAll("[data-label]")].map((node) => node.textContent),
      ).toStrictEqual([...labels, "following"]);
      expect([...document.querySelectorAll("p")].map((node) => node.textContent)).toStrictEqual([
        "before",
        "after",
      ]);
      const buttons = [...document.querySelectorAll("button")];
      buttons.forEach((button, i) => {
        expect(button).toBe(originalButtons[i]);
        for (let click = 0; click <= i; click++) button.click();
      });
      expect(buttons.map((button) => button.textContent)).toStrictEqual(
        buttons.map((_, i) => String(i + 1)),
      );
    },
  );

  test("preserves grandchildren passed through several island slots", async () => {
    const hydrate = await serve(
      <Frame>
        <div>
          <Counter label="parent">
            <div>
              <Counter label="grandchild">
                <span data-label="leaf">leaf</span>
              </Counter>
            </div>
          </Counter>
          <Counter label="sibling">
            <span data-label="sibling">sibling</span>
          </Counter>
        </div>
      </Frame>,
    );

    expect(hydrate).not.toThrow();
    expect(document.querySelectorAll("[data-counter]")).toHaveLength(3);
    expect(
      [...document.querySelectorAll("[data-label]")].map((node) => node.textContent),
    ).toStrictEqual(["leaf", "sibling"]);
    const grandchild = document.querySelector<HTMLButtonElement>(
      '[data-counter="grandchild"] > button',
    )!;
    grandchild.click();
    expect(grandchild.textContent).toBe("1");
    expect(document.querySelector('[data-counter="parent"] > button')!.textContent).toBe("0");
    expect(document.querySelector('[data-counter="sibling"] > button')!.textContent).toBe("0");
  });
});
