import { assert, describe, expect, test } from "vite-plus/test";
import { VNodeProps, type VText } from "../../../../v-node/mod.ts";
import { vElement } from "../../../../v-node/sync.ts";
import { setSubscriber, signal } from "../../../../signal/mod.ts";
import type { JSX } from "../../../../jsx-runtime/mod.ts";
import { Action, Props, Type } from "../dispatch.ts";
import { type DeleteElementChangeSet, element } from "./element.ts";

describe("element delete changeset", () => {
  test("drain nested text subscriptions on delete", () => {
    const sig = signal("live");

    // <div><span>{sig}</span></div> - the Delete changeset only targets
    // the outer element, so the drain must recurse to the text.
    const vNode = vElement<Node>(
      <JSX.ComponentNode<string>> <unknown> {
        type: "div",
        eventRefs: [],
        props: {
          children: {
            type: "span",
            eventRefs: [],
            props: { children: sig },
          },
        },
      },
      {},
    );
    const vSpan = vNode[VNodeProps.CHILDREN]?.[0] as ReturnType<
      typeof vElement<Node>
    >;
    const vTextChild = vSpan[VNodeProps.CHILDREN]?.[0] as VText<Node>;
    assert(vTextChild[VNodeProps.TEXT] === <unknown> sig);

    // Simulate the subscription the browser diff wired for the text.
    const writes: unknown[] = [];
    setSubscriber(() => sig.get(), {
      update: (value) => writes.push(value),
      cleanupCallback: (cleanup) =>
        vTextChild[VNodeProps.CLEANUP].push(cleanup),
    });

    vNode[VNodeProps.NODE_REF] = <Node> <unknown> { remove: () => {} };

    element(
      <DeleteElementChangeSet> {
        [Props.Type]: Type.Element,
        [Props.Action]: Action.Delete,
        [Props.Payload]: { vElement: vNode },
      },
    );

    // The commit point drained the nested subscription - the signal no
    // longer writes into the detached subtree.
    sig.set("gone");
    expect(writes).toStrictEqual([]);
    expect(vNode[VNodeProps.NODE_REF]).toStrictEqual(undefined);
  });
});
