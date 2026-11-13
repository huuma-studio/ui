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

  test.each(["replaces", "removes"] as const)(
    "a hidden second island returns after the first island %s its root",
    async (first) => {
      const controls = new Map<string, (value: number) => void>();
      function Toggle({ id }: { id: string }): JSX.Element {
        const state = hooks.$signal(0);
        controls.set(id, (value) => state.set(value));
        if (state.get() === 3) return null;
        return jsx(state.get() === 2 ? "p" : "button", { children: `${id}:${state.get()}` });
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
      await Promise.resolve();
      // With no node of its own, the second island only has its saved anchor.
      controls.get("second")!(3);
      controls.get("first")!(first === "replaces" ? 2 : 3);
      expect(() => controls.get("second")!(1)).not.toThrow();
      expect([...document.querySelector("main")!.children].map((node) => node.textContent)).toEqual(
        first === "replaces" ? ["first:2", "second:1", "after"] : ["second:1", "after"],
      );
    },
  );
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

describe("content the server renders for the client", () => {
  test("keeps raw HTML", async () => {
    function Raw(): JSX.Element {
      return <div dangerouslySetInnerHTML={{ __html: "<b>Hello</b>" }} />;
    }
    const hydrate = await serve(<Raw />, [Raw]);
    const bold = document.querySelector("b")!;
    hydrate();
    expect(document.querySelector("div")!.innerHTML).toBe("<b>Hello</b>");
    expect(document.querySelector("b")).toBe(bold);
  });

  test("shows a select's value before and after hydration, and updates it", async () => {
    let setValue!: (value: string) => void;
    function Select(): JSX.Element {
      const value = hooks.$signal("second");
      setValue = (next) => value.set(next);
      return (
        <select value={value.get()}>
          <option value="first">First</option>
          <option value="second">Second</option>
        </select>
      );
    }
    const hydrate = await serve(<Select />, [Select]);
    const select = document.querySelector("select")!;
    expect(select.value).toBe("second");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      hydrate();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(select.value).toBe("second");
    setValue("first");
    expect(select.value).toBe("first");
  });

  test("shows a textarea's value before and after hydration, and updates it", async () => {
    let setValue!: (value: string) => void;
    function Textarea(): JSX.Element {
      const value = hooks.$signal("server text");
      setValue = (next) => value.set(next);
      return <textarea value={value.get()} />;
    }
    const hydrate = await serve(<Textarea />, [Textarea]);
    const textarea = document.querySelector("textarea")!;
    expect(textarea.value).toBe("server text");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      hydrate();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(textarea.value).toBe("server text");
    setValue("client text");
    expect(textarea.value).toBe("client text");
  });

  // Greptile's review of #90: each select showed its first option.
  test.each([
    [
      "options in raw HTML",
      () => (
        <select
          value="b"
          dangerouslySetInnerHTML={{
            __html: '<option value="a">A</option><option value="b" selected>B</option>',
          }}
        />
      ),
    ],
    [
      "option text with whitespace",
      () => (
        <select value="b">
          <option>a</option>
          <option>{"\n  b "}</option>
        </select>
      ),
    ],
    [
      "an option label in raw HTML",
      () => (
        <select value="b">
          <option value="a">A</option>
          <option value="b" dangerouslySetInnerHTML={{ __html: "<b>B</b>" }} />
        </select>
      ),
    ],
  ])("shows the selected option with %s", async (_, render) => {
    function Select(): JSX.Element {
      return render();
    }
    const hydrate = await serve(<Select />, [Select]);
    const select = document.querySelector("select")!;
    // The index: happy-dom doesn't collapse an option's text into its value.
    expect(select.selectedIndex).toBe(1);
    hydrate();
    expect(document.querySelector("select")).toBe(select);
    expect(select.options).toHaveLength(2);
    expect(select.selectedIndex).toBe(1);
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

  // Like React: an attribute the client doesn't render may come from a
  // browser extension or a script that ran before hydration.
  test.each(["class", "data-gramm", "disabled"])(
    "keeps attribute %s the client doesn't render",
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
      client = true;
      hydrate();
      expect(document.querySelector("button")).toBe(button);
      expect(button.hasAttribute(attribute)).toBe(true);
      expect(button.getAttribute("aria-label")).toBe("keep");
    },
  );

  test.each([
    ["class", "server", false],
    ["class", "server", "client"],
    ["disabled", true, false],
    ["style", "color: red", "color: blue"],
  ])(
    "keeps attribute %s=%j the client renders as %j, and warns",
    async (attribute, server, client) => {
      let hydrating = false;
      function Mismatch(): JSX.Element {
        return jsx("button", { [attribute]: hydrating ? client : server, children: "keep" });
      }
      const hydrate = await serve(<Mismatch />, [Mismatch]);
      const button = document.querySelector("button")!;
      const before = button.getAttribute(attribute);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        hydrating = true;
        hydrate();
        expect(document.querySelector("button")).toBe(button);
        expect(button.getAttribute(attribute)).toBe(before);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`Hydration kept the server's attributes of <button>`),
        );
        expect(warn.mock.calls.flat().join("\n")).toContain(`${attribute}=`);
      } finally {
        warn.mockRestore();
      }
    },
  );

  test("keeps a class an extension added before hydration", async () => {
    function Styled(): JSX.Element {
      return <button class="app">keep</button>;
    }
    const hydrate = await serve(<Styled />, [Styled]);
    const button = document.querySelector("button")!;
    button.classList.add("extension");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      hydrate();
    } finally {
      warn.mockRestore();
    }
    expect(button.className).toBe("app extension");
  });

  test("doesn't warn when the server and the client render the same attributes", async () => {
    function Same(): JSX.Element {
      return (
        <button class="same" disabled aria-pressed={false} data-count={2}>
          same
        </button>
      );
    }
    const hydrate = await serve(<Same />, [Same]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      hydrate();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("keeps a custom element added before hydration, removes stale markup", async () => {
    let client = false;
    function Mismatch(): JSX.Element {
      return (
        <div data-mismatch="">
          <span>keep</span>
          {!client && <button>stale</button>}
        </div>
      );
    }
    const hydrate = await serve(<Mismatch />, [Mismatch]);
    const container = document.querySelector("[data-mismatch]")!;
    container.appendChild(document.createElement("grammarly-extension"));
    client = true;
    hydrate();
    expect([...container.children].map((node) => node.localName)).toEqual([
      "span",
      "grammarly-extension",
    ]);
  });
});

describe("an update that fails after hydration", () => {
  test("keeps the effects of a component it would have removed", async () => {
    const { signal } = await import("../../signal/mod.ts");
    const source = signal(0);
    const seen: number[] = [];
    let setFail: (next: boolean) => void = () => {};
    function Child(): JSX.Element {
      hooks.$effect(() => {
        seen.push(source.get());
      });
      return <span>child</span>;
    }
    function Throwing(): JSX.Element {
      throw new Error("render failed");
    }
    function Root(): JSX.Element {
      const fail = hooks.$signal(false);
      setFail = (next) => fail.set(next);
      return (
        <div>
          {fail.get() ? false : <Child />}
          {fail.get() ? <Throwing /> : <p />}
        </div>
      );
    }
    const hydrate = await serve(<Root />, [Root]);
    hydrate();
    await Promise.resolve();

    expect(() => setFail(true)).toThrow("render failed");
    // A retry that keeps the component, and its effect.
    setFail(false);
    seen.length = 0;
    source.set(1);

    expect(seen).toStrictEqual([1]);
    expect(document.querySelector("span")?.textContent).toBe("child");
  });
});
