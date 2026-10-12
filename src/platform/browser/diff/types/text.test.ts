import { assert, describe, expect, test } from "vite-plus/test";
import { VNodeProps, vText } from "../../../../v-node/mod.ts";
import { setSubscriber, signal } from "../../../../signal/mod.ts";
import type { JSX } from "../../../../jsx-runtime/mod.ts";
import { type AttachmentRef, AttachmentType } from "../attachment-ref.ts";
import { Action, Props, Type } from "../dispatch.ts";
import { text, type TextChangeSet } from "./text.ts";

const replaceChangeSet = (
  vNode: ReturnType<typeof vText<Node>>,
  attachmentRef: AttachmentRef,
): TextChangeSet =>
  <TextChangeSet> {
    [Props.Type]: Type.Text,
    [Props.Action]: Action.Replace,
    [Props.Payload]: { vText: vNode, attachmentRef },
  };

describe("text replace changeset", () => {
  test("rebind the existing DOM node to the new signal", () => {
    const sig = signal("B");
    const vNode = vText<Node>(<JSX.SignalLike> <unknown> sig);
    const node = <Node> <unknown> { nodeType: 3, textContent: "A" };
    // updateText copies the previous vNode's node ref before dispatch.
    vNode[VNodeProps.NODE_REF] = node;
    const attachmentRef: AttachmentRef = {
      type: AttachmentType.Sibling,
      node: <Node> {},
    };

    text(replaceChangeSet(vNode, attachmentRef));

    // The node identity is preserved - attachment anchors stored elsewhere
    // (component self-update refs, island roots) stay valid.
    assert(vNode[VNodeProps.NODE_REF] === node);
    expect(node.textContent).toStrictEqual("B");

    // Following siblings anchor after the rebound node.
    assert(attachmentRef.type === AttachmentType.Sibling);
    assert(attachmentRef.node === node);

    // The new signal owns the node and its cleanup is registered.
    sig.set("C");
    expect(node.textContent).toStrictEqual("C");
    expect(vNode[VNodeProps.CLEANUP].length).toStrictEqual(1);
  });

  test("drop the previous signal's subscription at the commit", () => {
    const previousSig = signal("old");
    const nextSig = signal("new");

    const vNode = vText<Node>(<JSX.SignalLike> <unknown> nextSig);
    const node = <Node> <unknown> { nodeType: 3, textContent: "old" };
    vNode[VNodeProps.NODE_REF] = node;

    // Simulate the subscription the browser diff created for the
    // previous signal - the vNode walk leaves it untouched.
    const previousWrites: unknown[] = [];
    setSubscriber(() => previousSig.get(), {
      update: (value) => previousWrites.push(value),
      cleanupCallback: (cleanup) => vNode[VNodeProps.CLEANUP].push(cleanup),
    });

    const attachmentRef: AttachmentRef = {
      type: AttachmentType.Sibling,
      node: <Node> {},
    };

    text(replaceChangeSet(vNode, attachmentRef));

    // The handler is the commit point: the old subscription is gone...
    previousSig.set("stale");
    expect(previousWrites).toStrictEqual([]);

    // ...and the node is owned by the new signal alone.
    nextSig.set("next");
    expect(node.textContent).toStrictEqual("next");
    expect(vNode[VNodeProps.CLEANUP].length).toStrictEqual(1);
  });

  test("write the plain text on a signal-to-string change", () => {
    const vNode = vText<Node>("static");
    const node = <Node> <unknown> { nodeType: 3, textContent: "reactive" };
    vNode[VNodeProps.NODE_REF] = node;
    const attachmentRef: AttachmentRef = {
      type: AttachmentType.Sibling,
      node: <Node> {},
    };

    text(replaceChangeSet(vNode, attachmentRef));

    assert(vNode[VNodeProps.NODE_REF] === node);
    expect(node.textContent).toStrictEqual("static");
  });

  test(
    "structurally replace a non-text node from hydration divergence",
    () => {
      const sig = signal("live");
      const vNode = vText<Node>(<JSX.SignalLike> <unknown> sig);

      const swaps: unknown[][] = [];
      const parentNode = {
        replaceChild: (next: unknown, previous: unknown) =>
          swaps.push([next, previous]),
      };
      // Hydration's divergence path paired the vText with an element.
      const divergent = <Node> <unknown> { nodeType: 1, parentNode };
      vNode[VNodeProps.NODE_REF] = divergent;

      const attachmentRef: AttachmentRef = {
        type: AttachmentType.Sibling,
        node: <Node> {},
      };

      // createBoundNode needs the DOM Text constructor - stub it.
      const globals = <Record<string, unknown>> globalThis;
      const originalText = globals.Text;
      globals.Text = class {
        textContent: string;
        constructor(value: unknown) {
          this.textContent = `${value}`;
        }
      };
      try {
        text(replaceChangeSet(vNode, attachmentRef));
      } finally {
        if (originalText === undefined) delete globals.Text;
        else globals.Text = originalText;
      }

      const replacement = vNode[VNodeProps.NODE_REF];
      assert(replacement !== divergent);
      expect(swaps).toStrictEqual([[replacement, divergent]]);

      // The subscription drives the replacement node.
      sig.set("updated");
      expect((<{ textContent: string }> <unknown> replacement).textContent).toStrictEqual("updated");

      // Siblings anchor after the replacement.
      assert(attachmentRef.type === AttachmentType.Sibling);
      assert(attachmentRef.node === replacement);
    },
  );

  test("leave the anchor untouched without a linked node", () => {
    const vNode = vText<Node>("orphan");
    const anchor = <Node> {};
    const attachmentRef: AttachmentRef = {
      type: AttachmentType.Sibling,
      node: anchor,
    };

    text(replaceChangeSet(vNode, attachmentRef));

    // No node to rebind: siblings must not chain onto a dangling node.
    assert(attachmentRef.node === anchor);
    expect(vNode[VNodeProps.NODE_REF]).toStrictEqual(undefined);
  });
});
