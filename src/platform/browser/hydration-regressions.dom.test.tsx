// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { jsx, type JSX } from "../../jsx-runtime/mod.ts";
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

// Exercise the real server markers and browser manifest, including slot
// reconstruction. Handwritten HTML would miss the boolean-attribute bug.
async function serve(element: JSX.Element, components: JSX.Component[]) {
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
  return () => runtime.launch(manifest, {});
}

function Frame({ children }: JSX.ComponentProps): JSX.Element {
  return <section>{children}</section>;
}

describe("independent island attachment after hydration", () => {
  test.each([
    ["replaces", "rerenders"],
    ["replaces", "replaces"],
    ["removes", "rerenders"],
    ["removes", "replaces"],
  ] as const)("first island %s its root, then second island %s", async (first, second) => {
    const controls = new Map<string, (value: number) => void>();
    function Toggle({ id }: { id: string }): JSX.Element {
      const state = hooks.$signal(0);
      controls.set(id, (value) => state.set(value));
      if (state.get() === 3) return null;
      return jsx(state.get() === 2 ? "p" : "button", {
        "data-id": id,
        title: String(state.get()),
        children: `${id}:${state.get()}`,
      });
    }
    const hydrate = await serve(
      <main>
        <Toggle id="first" />
        <Toggle id="second" />
        <aside>after</aside>
      </main>,
      [Toggle],
    );
    hydrate();
    // Marker removal is asynchronous. These must work after startup too.
    await Promise.resolve();
    const originalSecond = document.querySelector('[data-id="second"]');
    controls.get("first")!(first === "replaces" ? 2 : 3);
    const next = second === "replaces" ? 2 : 1;
    expect(() => controls.get("second")!(next)).not.toThrow();
    const updatedSecond = document.querySelector('[data-id="second"]');
    expect(updatedSecond?.textContent).toBe(`second:${next}`);
    if (second === "rerenders") expect(updatedSecond).toBe(originalSecond);
    expect([...document.querySelector("main")!.children].map((node) => node.textContent)).toEqual(
      first === "replaces" ? ["first:2", `second:${next}`, "after"] : [`second:${next}`, "after"],
    );
    // Recreating the first island must still insert it before the second.
    controls.get("first")!(0);
    expect([...document.querySelector("main")!.children].map((node) => node.textContent)).toEqual([
      "first:0",
      `second:${next}`,
      "after",
    ]);
  });
});

describe("boolean attributes in server-rendered island children", () => {
  test.each([
    ["button", "disabled"],
    ["input", "checked"],
    ["input", "required"],
    ["input", "readonly"],
    ["select", "multiple"],
    ["details", "open"],
    ["div", "hidden"],
  ])("preserves %s[%s] through a static slot wrapper", async (tag, attribute) => {
    const hydrate = await serve(
      <Frame>
        <div>{jsx(tag, { "data-field": "", type: "checkbox", [attribute]: true })}</div>
      </Frame>,
      [Frame],
    );
    const field = document.querySelector("[data-field]")!;
    expect(field.hasAttribute(attribute)).toBe(true);
    hydrate();
    expect(document.querySelector("[data-field]")).toBe(field);
    expect(field.hasAttribute(attribute)).toBe(true);
    if (attribute === "checked") expect((field as HTMLInputElement).checked).toBe(true);
  });

  test("preserves the selected option in a direct slot child", async () => {
    const hydrate = await serve(
      <Frame>
        <select>
          <option value="first">First</option>
          <option value="second" selected>
            Second
          </option>
        </select>
      </Frame>,
      [Frame],
    );
    const select = document.querySelector("select")!;
    expect(select.value).toBe("second");
    hydrate();
    expect(select.value).toBe("second");
    expect(select.options[1].selected).toBe(true);
  });

  test("keeps absent boolean attributes false and aria/data strings intact", async () => {
    const hydrate = await serve(
      <Frame>
        <button disabled={false} aria-disabled="false" data-enabled="true">
          Enabled
        </button>
      </Frame>,
      [Frame],
    );
    hydrate();
    const button = document.querySelector("button")!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(button.getAttribute("data-enabled")).toBe("true");
  });
});

describe("form edits made before hydration", () => {
  test.each([
    ["island", "user typed"],
    ["island", ""],
    ["slot", "user typed"],
    ["slot", ""],
  ] as const)("preserves a %s input edited to %j", async (placement, edited) => {
    let setValue: (value: string) => void = () => {};
    function Input(): JSX.Element {
      const value = hooks.$signal("server");
      setValue = (next) => value.set(next);
      return <input value={value.get()} />;
    }
    const hydrate = await serve(
      placement === "island" ? (
        <Input />
      ) : (
        <Frame>
          <input value="server" />
        </Frame>
      ),
      [Input, Frame],
    );
    const input = document.querySelector("input")!;
    expect(input.value).toBe("server");
    input.focus();
    input.value = edited;
    input.setSelectionRange(0, edited.length);
    hydrate();
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe(edited);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, edited.length]);
    // Preserving a pre-hydration edit must not disable subsequent updates.
    if (placement === "island") {
      setValue("application update");
      expect(input.value).toBe("application update");
    }
  });

  test.each([true, false])(
    "preserves a checkbox toggled from %s before hydration",
    async (initial) => {
      function Checkbox(): JSX.Element {
        return <input type="checkbox" checked={initial} />;
      }
      const hydrate = await serve(<Checkbox />, [Checkbox]);
      const input = document.querySelector("input")!;
      expect(input.checked).toBe(initial);
      input.checked = !initial;
      hydrate();
      expect(document.querySelector("input")).toBe(input);
      expect(input.checked).toBe(!initial);
    },
  );

  test("keeps an untouched input's server value", async () => {
    const hydrate = await serve(
      <Frame>
        <input value="server" />
      </Frame>,
      [Frame],
    );
    hydrate();
    expect(document.querySelector("input")!.value).toBe("server");
  });
});

describe("hydration mismatch recovery", () => {
  test.each(["trailing element", "trailing text", "all children", "null root"] as const)(
    "removes stale server markup: %s, without consuming the next island",
    async (mismatch) => {
      let client = false;
      function Mismatch(): JSX.Element {
        if (client && mismatch === "null root") return null;
        return (
          <div data-mismatch="">
            {(!client || mismatch === "trailing element" || mismatch === "trailing text") && (
              <span>keep</span>
            )}
            {!client && (mismatch === "trailing text" ? "stale" : <button>stale</button>)}
          </div>
        );
      }
      function Following(): JSX.Element {
        const count = hooks.$signal(0);
        return (
          <button data-following="" on-click={() => count.set(count.get() + 1)}>
            {count}
          </button>
        );
      }
      const hydrate = await serve(
        <main>
          <Mismatch />
          <Following />
          <aside>after</aside>
        </main>,
        [Mismatch, Following],
      );
      const following = document.querySelector<HTMLButtonElement>("[data-following]")!;
      expect(document.querySelector("[data-mismatch]")!.textContent).toContain("stale");
      client = true;
      hydrate();
      const container = document.querySelector("[data-mismatch]");
      if (mismatch === "null root") {
        expect(container).toBeNull();
      } else {
        expect(container!.textContent).toBe(mismatch === "all children" ? "" : "keep");
        expect(container!.childNodes).toHaveLength(mismatch === "all children" ? 0 : 1);
      }
      expect(document.querySelector("[data-following]")).toBe(following);
      following.click();
      expect(following.textContent).toBe("1");
      expect(document.querySelector("aside")!.textContent).toBe("after");
    },
  );

  test.each(["class", "data-stale", "disabled"])(
    "removes server-only attribute %s",
    async (attribute) => {
      let client = false;
      function Mismatch(): JSX.Element {
        return jsx("button", {
          ...(client ? {} : { [attribute]: attribute === "disabled" ? true : "server" }),
          "aria-label": "keep",
          children: "keep",
        });
      }
      const hydrate = await serve(<Mismatch />, [Mismatch]);
      const button = document.querySelector("button")!;
      expect(button.hasAttribute(attribute)).toBe(true);
      client = true;
      hydrate();
      expect(document.querySelector("button")).toBe(button);
      expect(button.hasAttribute(attribute)).toBe(false);
      expect(button.getAttribute("aria-label")).toBe("keep");
      expect(button.textContent).toBe("keep");
    },
  );
});
