import { assert, assertEquals } from "@std/assert";
import {
  create,
  update,
  type VComponent,
  vElement,
  VNodeProps,
  VType,
} from "../mod.ts";
import type { JSX } from "../../jsx-runtime/jsx.ts";
import { $signal } from "../../hooks/signal.ts";
import { WritableSignal } from "../../signal/mod.ts";

Deno.test(update.name, async (t) => {
  await t.step("update VText", () => {
    const vNode = create("Hello World");
    const updatedVNode = update("Hello Univers", vNode, { $: [] });

    assertEquals(vNode, {
      type: VType.TEXT,
      [VNodeProps.TEXT]: "Hello Univers",
      [VNodeProps.SKIP_ESCAPING]: false,
      [VNodeProps.CLEANUP]: [],
    });

    assert(vNode === updatedVNode);
  });

  await t.step("update VElement", () => {
    const vNode = vElement(
      <div>Hello World</div> as JSX.ComponentNode<string>,
      {
        $: [],
      },
    );

    const clickListener = () => {};

    const updateVElement = update(
      <div on-click={clickListener}>Hello Univers</div>,
      vNode,
      { $: [] },
    );

    assertEquals(updateVElement, {
      type: VType.ELEMENT,
      [VNodeProps.TAG]: "div",
      [VNodeProps.KEY]: undefined,
      [VNodeProps.PROPS]: { children: ["Hello Univers"] },
      [VNodeProps.CHILDREN]: [{
        type: VType.TEXT,
        [VNodeProps.TEXT]: "Hello Univers",
        [VNodeProps.SKIP_ESCAPING]: false,
        [VNodeProps.CLEANUP]: [],
      }],
      [VNodeProps.EVENT_REFS]: [
        {
          listener: clickListener,
          name: "click",
        },
      ],
      [VNodeProps.OPTIONS]: { _GLOBAL: { $: [] } },
    });

    //Check if its the same object
    assert(vNode === updateVElement);
  });
  await t.step("update vComponent", () => {
    const vComponent = create(<A />);

    const signal = (vComponent as VComponent<unknown>)[VNodeProps.OPTIONS]
      .$ as WritableSignal<unknown>[];

    signal[0].set(2);

    const updatedVComponent = update(<A />, vComponent, {}, true);

    assertEquals(updatedVComponent, {
      [VNodeProps.AST]: {
        [VNodeProps.KEY]: undefined,
        [VNodeProps.EVENT_REFS]: [],
        [VNodeProps.CHILDREN]: [
          {
            [VNodeProps.SKIP_ESCAPING]: false,
            [VNodeProps.TEXT]: "Hello",
            type: 0,
            [VNodeProps.CLEANUP]: [],
          },
        ],
        [VNodeProps.TAG]: "div",
        [VNodeProps.PROPS]: {
          children: [
            "Hello",
          ],
        },
        [VNodeProps.OPTIONS]: {
          _GLOBAL: {},
        },
        type: 1,
      },
      [VNodeProps.CLEANUP]: [],
      [VNodeProps.KEY]: undefined,
      [VNodeProps.FN]: A,
      [VNodeProps.PROPS]: {
        children: undefined,
      },
      [VNodeProps.MODE]: 1,
      [VNodeProps.OPTIONS]: {
        "$": [
          new WritableSignal(1),
        ],
        _GLOBAL: {},
      },
      type: VType.COMPONENT,
    });
    assert(vComponent === updatedVComponent);
  });
});

const A = () => {
  const show = $signal(null);
  return show.get() && <div>Hello</div>;
};
