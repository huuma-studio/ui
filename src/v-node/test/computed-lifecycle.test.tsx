import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { $computed } from "../../hooks/signal.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";
import { signal } from "../../signal/mod.ts";
import { VNodeProps } from "../mod.ts";
import { create, setVNodeUpdater, update } from "../sync.ts";

beforeEach(() => {
  // The browser's component subscription lifecycle, without needing a DOM.
  setVNodeUpdater((component, vComponent, globalOptions) => ({
    update: () => update(component, vComponent, globalOptions),
    cleanupCallback: (cleanup) => vComponent[VNodeProps.CLEANUP].push(cleanup),
  }));
});

afterEach(() => {
  setVNodeUpdater(undefined as never);
});

describe("computed hook teardown", () => {
  test.each(["removed", "replaced"])("stops computing after a component is %s", (operation) => {
    const source = signal(0);
    const calls: number[] = [];
    function Child() {
      const value = $computed(() => {
        calls.push(source.get());
        return source.get();
      });
      return <span>{value.get()}</span>;
    }
    const vnode = create(<Child />);
    update(operation === "removed" ? null : <p>replacement</p>, vnode, {});
    calls.length = 0;

    source.set(1);
    expect(calls).toStrictEqual([]);
  });

  test("repeated mount and removal leaves only the live component subscribed", () => {
    const source = signal(0);
    const calls: string[] = [];
    const rendered: number[] = [];
    function Child({ id }: { id: string }) {
      const value = $computed(() => {
        calls.push(id);
        return source.get();
      });
      rendered.push(value.get());
      return <span>{value.get()}</span>;
    }
    for (let i = 0; i < 50; i++) {
      const vnode = create(<Child id={`removed-${i}`} />);
      update(null, vnode, {});
    }
    const live = create(<Child id="live" />);
    calls.length = 0;
    rendered.length = 0;
    try {
      source.set(1);
      expect.soft(calls).toStrictEqual(["live"]);
      expect(rendered).toStrictEqual([1]);
    } finally {
      update(null, live, {});
    }
  });

  test("tears down the full computed chain when its owning component is removed", () => {
    const source = signal(0);
    const calls: string[] = [];
    function Child() {
      const first = $computed(() => {
        calls.push("first");
        return source.get() + 1;
      });
      const second = $computed(() => {
        calls.push("second");
        return first.get() * 2;
      });
      return <span>{second.get()}</span>;
    }
    const vnode = create(
      <div>
        <Child />
      </div>,
    );
    update(null, vnode, {});
    calls.length = 0;

    source.set(1);
    expect(calls).toStrictEqual([]);
  });

  test("replacing a keyed component disposes only the old instance's computed", () => {
    const source = signal(0);
    const calls: string[] = [];
    function Child({ id }: JSX.ComponentProps & { id: string }) {
      const value = $computed(() => {
        calls.push(id);
        return source.get();
      });
      return <span>{value.get()}</span>;
    }
    const previous = create(<Child key="old" id="old" />);
    const next = update(<Child key="new" id="new" />, previous, {});
    calls.length = 0;
    try {
      source.set(1);
      expect(calls).toStrictEqual(["new"]);
    } finally {
      update(null, next, {});
    }
  });

  test("keeps computing after a pass that would remove it fails", () => {
    const source = signal(0);
    const rendered: number[] = [];
    function Child() {
      const value = $computed(() => source.get() * 2);
      rendered.push(value.get());
      return <span>{value.get()}</span>;
    }
    function Throwing(): JSX.Element {
      throw new Error("render failed");
    }
    const Root = ({ fail }: { fail?: boolean }) => (
      <div>
        {fail ? false : <Child />}
        {fail ? <Throwing /> : <p />}
      </div>
    );
    const vnode = create(<Root />);
    expect(() => update(<Root fail />, vnode, {})).toThrow("render failed");
    // A retry that keeps the component, and its computed.
    const next = update(<Root />, vnode, {});
    rendered.length = 0;
    try {
      source.set(2);
      expect(rendered).toStrictEqual([4]);
    } finally {
      update(null, next, {});
    }
  });

  test("keeps a computed alive through an ordinary component rerender", () => {
    const source = signal(0);
    const rendered: number[] = [];
    function Child({ label }: { label: string }) {
      const value = $computed(() => source.get() * 2);
      rendered.push(value.get());
      return (
        <span>
          {label}: {value.get()}
        </span>
      );
    }
    const vnode = create(<Child label="before" />);
    const next = update(<Child label="after" />, vnode, {});
    rendered.length = 0;
    try {
      source.set(2);
      expect(rendered).toStrictEqual([4]);
    } finally {
      update(null, next, {});
    }
  });
});
