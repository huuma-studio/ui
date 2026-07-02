import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  type VComponent,
  type VElement,
  VNodeProps,
  type VText,
  VType,
} from "../mod.ts";
import type { JSX } from "../../jsx-runtime/jsx.ts";
import { $destroy } from "../../hooks/lifecycle.ts";
import { $signal } from "../../hooks/signal.ts";
import { setSubscriber, signal, WritableSignal } from "../../signal/mod.ts";
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

  await t.step(
    "clean up the stale signal subscription of an updated VText",
    () => {
      const sigA = signal("A");
      const sigB = signal("B");

      const Root = ({ swap }: { swap?: boolean }) => (
        <div>{swap ? sigB : sigA}</div>
      );

      const vNode = create(<Root />);
      const vText = ((vNode as VComponent<unknown>)[VNodeProps.AST] as VElement<
        unknown
      >)[VNodeProps.CHILDREN]?.[0] as VText<unknown>;
      assert(vText[VNodeProps.TEXT] === sigA);

      // Simulate the browser diff wiring a DOM Text node to the signal.
      const domWrites: unknown[] = [];
      setSubscriber(
        () => (vText[VNodeProps.TEXT] as JSX.SignalLike).get(),
        {
          update: (value) => domWrites.push(value),
          cleanupCallback: (cleanup) => vText[VNodeProps.CLEANUP].push(cleanup),
        },
      );

      // Re-render with the other signal - the vText is updated in place.
      update(<Root swap />, vNode, {});
      assert(vText[VNodeProps.TEXT] === sigB);

      // The subscription to the replaced signal must be gone:
      // sigA no longer owns the text and must not write to it.
      sigA.set("stale");
      assertEquals(domWrites, []);
    },
  );

  await t.step(
    "run destroy hooks when replaced by an unrecognized node",
    () => {
      const destroyed: string[] = [];

      const Old = () => {
        $destroy(() => destroyed.push("Old"));
        return <div>Old</div>;
      };

      const vNode = create(<Old />);
      // NaN matches no node predicate (isTextNode requires a finite
      // number) and reaches update()'s fall-through tail.
      const updated = update(NaN, vNode, {});

      assertEquals(updated, undefined);
      assertEquals(destroyed, ["Old"]);
    },
  );

  await t.step(
    "run destroy hooks only once when an update pass aborts",
    () => {
      const destroyed: string[] = [];

      const Tracked = () => {
        $destroy(() => destroyed.push("Tracked"));
        return <div>tracked</div>;
      };
      const Throwing = (): JSX.Element => {
        throw new Error("render failed");
      };
      const Stable = () => <span>stable</span>;

      const Root = ({ fail }: { fail?: boolean }) => (
        <div>
          {fail ? false : <Tracked />}
          {fail ? <Throwing /> : <Stable />}
        </div>
      );

      const vNode = create(<Root />);

      // Tracked is destroyed, then the sibling's render aborts the pass
      // before the parent's children are reassigned.
      assertThrows(
        () => update(<Root fail />, vNode, {}),
        Error,
        "render failed",
      );
      assertEquals(destroyed, ["Tracked"]);

      // The retry walks the stale children again - Tracked's hooks must
      // not re-fire.
      assertThrows(
        () => update(<Root fail />, vNode, {}),
        Error,
        "render failed",
      );
      assertEquals(destroyed, ["Tracked"]);
    },
  );

  await t.step(
    "clean up signal subscriptions of a destroyed subtree",
    () => {
      const sig = signal("A");

      const Root = ({ show }: { show?: boolean }) =>
        show ? <div>{sig}</div> : null;

      const vNode = create(<Root show />);
      const vText = ((vNode as VComponent<unknown>)[VNodeProps.AST] as VElement<
        unknown
      >)[VNodeProps.CHILDREN]?.[0] as VText<unknown>;
      assert(vText[VNodeProps.TEXT] === sig);

      // Simulate the browser diff wiring a DOM Text node to the signal.
      const domWrites: unknown[] = [];
      setSubscriber(
        () => (vText[VNodeProps.TEXT] as JSX.SignalLike).get(),
        {
          update: (value) => domWrites.push(value),
          cleanupCallback: (cleanup) => vText[VNodeProps.CLEANUP].push(cleanup),
        },
      );

      // Re-render with the subtree removed - destroying the text must
      // drop its subscription.
      update(<Root />, vNode, {});

      sig.set("stale");
      assertEquals(domWrites, []);
    },
  );
});

const A = () => {
  const show = $signal(null);
  return show.get() && <div>Hello</div>;
};
