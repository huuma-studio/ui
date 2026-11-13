import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { computed, signal } from "../../signal/mod.ts";
import { VNodeProps } from "../mod.ts";
import { create, setVNodeUpdater, update } from "../sync.ts";

describe("component signal updates", () => {
  // Re-render on signal changes like the browser runtime, without the DOM
  // diff.
  beforeAll(() => {
    setVNodeUpdater((component, vComponent, globalOptions) => ({
      update: () => update(component, vComponent, globalOptions),
      cleanupCallback: (cleanup) => vComponent[VNodeProps.CLEANUP].push(cleanup),
    }));
  });
  afterAll(() => {
    setVNodeUpdater(undefined as never);
  });

  test("render a child once with current props when parent and child read the same signal", () => {
    const count = signal(0);
    const childRenders: [number, number][] = [];

    const Child = ({ n }: { n: number }) => {
      childRenders.push([n, count.get()]);
      return <span>{n}</span>;
    };
    const Parent = () => (
      <div>
        <Child n={count.get()} />
      </div>
    );

    create(<Parent />, {});
    childRenders.length = 0;

    count.set(1);
    expect(childRenders).toStrictEqual([[1, 1]]);
  });

  test("render the parent first when the child also reads an unchanged computed", () => {
    const count = signal(0);
    // Created before the components, and unchanged by count 0 → 2.
    const parity = computed(() => count.get() % 2);
    const childRenders: [number, number][] = [];

    const Child = ({ n }: { n: number }) => {
      parity.get();
      childRenders.push([n, count.get()]);
      return <span>{n}</span>;
    };
    const Parent = () => (
      <div>
        <Child n={count.get()} />
      </div>
    );

    create(<Parent />, {});
    childRenders.length = 0;

    count.set(2);
    expect(childRenders).toStrictEqual([[2, 2]]);
  });
});
