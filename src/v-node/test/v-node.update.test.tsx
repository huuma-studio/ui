import { assert, assertEquals, assertThrows } from "@std/assert";
import { type VComponent, VNodeProps, VType } from "../mod.ts";
import type { JSX } from "../../jsx-runtime/jsx.ts";
import { $destroy } from "../../hooks/lifecycle.ts";
import { $signal } from "../../hooks/signal.ts";
import { WritableSignal } from "../../signal/mod.ts";
import { create, update, vElement } from "../sync.ts";

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
      [VNodeProps.BIND]: undefined,
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
        [VNodeProps.BIND]: undefined,
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

  await t.step("throw on TemplateNode", () => {
    const vNode = create("Hello World");
    const templateNode: JSX.TemplateNode = {
      templates: ["<div>", "</div>"],
      nodes: ["Hello Univers"],
    };

    assertThrows(
      () => update(templateNode, vNode, {}),
      Error,
      "TemplateNode is not supported in update()",
    );

    // Throws before cleanup - the previous vNode stays untouched.
    assertEquals(vNode, {
      type: VType.TEXT,
      [VNodeProps.TEXT]: "Hello World",
      [VNodeProps.SKIP_ESCAPING]: false,
      [VNodeProps.CLEANUP]: [],
    });
  });

  await t.step(
    "run destroy hooks of a VComponent replaced by another component",
    () => {
      const destroyed: string[] = [];

      const Old = () => {
        $destroy(() => destroyed.push("Old"));
        return <div>Old</div>;
      };
      const OldChild = () => {
        $destroy(() => destroyed.push("OldChild"));
        return <span>OldChild</span>;
      };
      const OldParent = () => {
        $destroy(() => destroyed.push("OldParent"));
        return (
          <div>
            <OldChild />
          </div>
        );
      };
      const New = () => <div>New</div>;

      const Root = ({ swap }: { swap?: boolean }) =>
        swap ? <New /> : <OldParent />;

      const vNode = create(<Root />);
      update(<Root swap />, vNode, {});

      // Nested components are destroyed too.
      assertEquals(destroyed.sort(), ["OldChild", "OldParent"]);

      destroyed.length = 0;

      // Same for a component replaced by an element.
      const ElementRoot = ({ swap }: { swap?: boolean }) =>
        swap ? <div>element</div> : <Old />;

      const elementVNode = create(<ElementRoot />);
      update(<ElementRoot swap />, elementVNode, {});

      assertEquals(destroyed, ["Old"]);
    },
  );
});

const A = () => {
  const show = $signal(null);
  return show.get() && <div>Hello</div>;
};
