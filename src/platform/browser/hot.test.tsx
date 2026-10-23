import { describe, expect, test } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import type { VComponent } from "../../v-node/mod.ts";
import { create } from "../../v-node/sync.ts";
import {
  hotReplaceIsland,
  registerIslandModule,
  registerMountedIsland,
  usesComponent,
} from "./hot.ts";

function Counter(): JSX.Element {
  return <button>0</button>;
}
function NextCounter(): JSX.Element {
  return <button>1</button>;
}
function Card({ children }: { children?: JSX.Element }): JSX.Element {
  return <section>{children}</section>;
}

describe(usesComponent.name, () => {
  test("finds a component anywhere in a rendered tree", () => {
    function Page(): JSX.Element {
      return (
        <main>
          <Card>
            <Counter />
          </Card>
        </main>
      );
    }
    const vNode = create(<Page />);
    expect(usesComponent(vNode, Counter)).toStrictEqual(true);
    expect(usesComponent(vNode, Card)).toStrictEqual(true);
    expect(usesComponent(vNode, NextCounter)).toStrictEqual(false);
  });
});

// Replacing an island's own component changes the DOM, which the Vite
// plugin's dev server tests check in a browser. These cover the cases
// that leave the page alone.
describe(hotReplaceIsland.name, () => {
  test("does nothing for a module without islands on the page", () => {
    expect(hotReplaceIsland("/app/other.client.tsx", NextCounter)).toStrictEqual(true);
  });

  test("declines a component another island renders", () => {
    // `Wrapper` imports `Counter` itself: its module keeps the previous one.
    function Wrapper(): JSX.Element {
      return <Counter />;
    }
    registerIslandModule("/app/counter.client.tsx", Counter);
    registerIslandModule("/app/wrapper.client.tsx", Wrapper);
    const element = (<Wrapper />) as JSX.ComponentNode<JSX.Component>;
    registerMountedIsland({ element, vNode: create(element) as VComponent<Node>, options: {} });

    expect(hotReplaceIsland("/app/counter.client.tsx", NextCounter)).toStrictEqual(false);
    // The module's component is the new one from now on: replacing it
    // again compares against `NextCounter`, which nothing renders.
    expect(hotReplaceIsland("/app/counter.client.tsx", Counter)).toStrictEqual(true);
  });
});
