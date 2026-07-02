import { assert, assertEquals } from "@std/assert";
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

Deno.test("text replace changeset", async (t) => {
  await t.step("rebind the existing DOM node to the new signal", () => {
    const sig = signal("B");
    const vNode = vText<Node>(<JSX.SignalLike> <unknown> sig);
    const node = <Node> <unknown> { textContent: "A" };
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
    assertEquals(node.textContent, "B");

    // Following siblings anchor after the rebound node.
    assert(attachmentRef.type === AttachmentType.Sibling);
    assert(attachmentRef.node === node);

    // The new signal owns the node and its cleanup is registered.
    sig.set("C");
    assertEquals(node.textContent, "C");
    assertEquals(vNode[VNodeProps.CLEANUP].length, 1);
  });

  await t.step("drop the previous signal's subscription at the commit", () => {
    const previousSig = signal("old");
    const nextSig = signal("new");

    const vNode = vText<Node>(<JSX.SignalLike> <unknown> nextSig);
    const node = <Node> <unknown> { textContent: "old" };
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
    assertEquals(previousWrites, []);

    // ...and the node is owned by the new signal alone.
    nextSig.set("next");
    assertEquals(node.textContent, "next");
    assertEquals(vNode[VNodeProps.CLEANUP].length, 1);
  });

  await t.step("write the plain text on a signal-to-string change", () => {
    const vNode = vText<Node>("static");
    const node = <Node> <unknown> { textContent: "reactive" };
    vNode[VNodeProps.NODE_REF] = node;
    const attachmentRef: AttachmentRef = {
      type: AttachmentType.Sibling,
      node: <Node> {},
    };

    text(replaceChangeSet(vNode, attachmentRef));

    assert(vNode[VNodeProps.NODE_REF] === node);
    assertEquals(node.textContent, "static");
  });

  await t.step("leave the anchor untouched without a linked node", () => {
    const vNode = vText<Node>("orphan");
    const anchor = <Node> {};
    const attachmentRef: AttachmentRef = {
      type: AttachmentType.Sibling,
      node: anchor,
    };

    text(replaceChangeSet(vNode, attachmentRef));

    // No node to rebind: siblings must not chain onto a dangling node.
    assert(attachmentRef.node === anchor);
    assertEquals(vNode[VNodeProps.NODE_REF], undefined);
  });
});
