import { assertEquals } from "@std/assert";
import { computed, signal } from "../../signal/mod.ts";
import { VNodeProps } from "../mod.ts";
import { create, setVNodeUpdater, update } from "../sync.ts";

Deno.test("component signal updates", async (t) => {
  // Re-render on signal changes like the browser runtime, without the DOM
  // diff.
  setVNodeUpdater((component, vComponent, globalOptions) => ({
    update: () => update(component, vComponent, globalOptions),
    cleanupCallback: (cleanup) => vComponent[VNodeProps.CLEANUP].push(cleanup),
  }));

  try {
    await t.step(
      "render a child once with current props when parent and child read the same signal",
      () => {
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
        assertEquals(childRenders, [[1, 1]]);
      },
    );

    await t.step(
      "render the parent first when the child also reads an unchanged computed",
      () => {
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
        assertEquals(childRenders, [[2, 2]]);
      },
    );
  } finally {
    setVNodeUpdater(undefined as never);
  }
});
