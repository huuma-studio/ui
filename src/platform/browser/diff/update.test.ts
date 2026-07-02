import { assert, assertEquals } from "@std/assert";
import { VNodeProps, vText } from "../../../v-node/mod.ts";
import { signal } from "../../../signal/mod.ts";
import type { JSX } from "../../../jsx-runtime/mod.ts";
import { type AttachmentRef, AttachmentType } from "./attachment-ref.ts";
import { Action, Props, Type } from "./dispatch.ts";
import { update } from "./update.ts";

const attachmentRef = (): AttachmentRef => ({
  type: AttachmentType.Sibling,
  node: <Node> {},
});

const asSignal = (value: string): JSX.SignalLike =>
  <JSX.SignalLike> <unknown> signal(value);

Deno.test("update text changesets", async (t) => {
  await t.step("keep the binding when the signal is unchanged", () => {
    const vNode = vText<Node>(asSignal("A"));
    const previousVNode = { ...vNode };

    const changeSets = update(vNode, previousVNode, attachmentRef());

    assertEquals(changeSets.length, 1);
    assertEquals(changeSets[0][Props.Type], Type.Text);
    assertEquals(changeSets[0][Props.Action], Action.Link);
  });

  await t.step("replace the node when the signal identity changes", () => {
    const node = <Node> {};
    const previousVNode = vText<Node>(asSignal("A"));
    previousVNode[VNodeProps.NODE_REF] = node;
    const vNode = vText<Node>(asSignal("B"));

    const changeSets = update(vNode, previousVNode, attachmentRef());

    assertEquals(changeSets.length, 1);
    assertEquals(changeSets[0][Props.Type], Type.Text);
    assertEquals(changeSets[0][Props.Action], Action.Replace);
    // The replace handler needs the existing DOM node to swap it out.
    assert(vNode[VNodeProps.NODE_REF] === node);
  });

  await t.step(
    "replace the node when signals swap with equal values",
    () => {
      const previousVNode = vText<Node>(asSignal("same"));
      const vNode = vText<Node>(asSignal("same"));

      const changeSets = update(vNode, previousVNode, attachmentRef());

      assertEquals(changeSets.length, 1);
      assertEquals(changeSets[0][Props.Action], Action.Replace);
    },
  );

  await t.step("replace the node when a string becomes a signal", () => {
    const previousVNode = vText<Node>("static");
    const vNode = vText<Node>(asSignal("reactive"));

    const changeSets = update(vNode, previousVNode, attachmentRef());

    assertEquals(changeSets.length, 1);
    assertEquals(changeSets[0][Props.Action], Action.Replace);
  });

  await t.step("replace the node when a signal becomes a string", () => {
    const previousVNode = vText<Node>(asSignal("reactive"));
    const vNode = vText<Node>("static");

    const changeSets = update(vNode, previousVNode, attachmentRef());

    assertEquals(changeSets.length, 1);
    assertEquals(changeSets[0][Props.Action], Action.Replace);
  });

  await t.step("patch the text content for plain string changes", () => {
    const previousVNode = vText<Node>("Hello World");
    const vNode = vText<Node>("Hello Univers");

    const changeSets = update(vNode, previousVNode, attachmentRef());

    assertEquals(changeSets.length, 2);
    assertEquals(changeSets[0][Props.Action], Action.Link);
    assertEquals(changeSets[1][Props.Action], Action.Update);
  });

  await t.step("only link when the string is unchanged", () => {
    const previousVNode = vText<Node>("Hello World");
    const vNode = vText<Node>("Hello World");

    const changeSets = update(vNode, previousVNode, attachmentRef());

    assertEquals(changeSets.length, 1);
    assertEquals(changeSets[0][Props.Action], Action.Link);
  });
});
