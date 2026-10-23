import { assert, describe, expect, test } from "vite-plus/test";
import { snapshot, VNodeProps, vText } from "../../../v-node/mod.ts";
import { setSubscriber, signal } from "../../../signal/mod.ts";
import type { JSX } from "../../../jsx-runtime/mod.ts";
import { type AttachmentRef, AttachmentType } from "./attachment-ref.ts";
import { Action, Props, Type } from "./dispatch.ts";
import { update } from "./update.ts";

const attachmentRef = (): AttachmentRef => ({
  type: AttachmentType.Sibling,
  node: <Node>{},
});

const asSignal = (value: string): JSX.SignalLike => <JSX.SignalLike>(<unknown>signal(value));

// Commit a subscription for the signal, the way the browser diff's
// create/replace handlers do.
const bind = (vNode: ReturnType<typeof vText<Node>>, sig: { get: () => unknown }) =>
  setSubscriber(() => sig.get(), {
    update: () => {},
    cleanupCallback: (cleanup) => vNode[VNodeProps.CLEANUP].push(cleanup),
  });

describe("update text changesets", () => {
  test("keep the binding when the signal is unchanged", () => {
    const sig = asSignal("A");
    const vNode = vText<Node>(sig);
    bind(vNode, sig);
    // The runtime builds previousVNode with snapshot() (browser mod.ts).
    const previousVNode = snapshot(vNode);

    const changeSets = update(vNode, previousVNode, attachmentRef());

    expect(changeSets.length).toStrictEqual(1);
    expect(changeSets[0][Props.Type]).toStrictEqual(Type.Text);
    expect(changeSets[0][Props.Action]).toStrictEqual(Action.Link);
  });

  test("replace the node when the signal identity changes", () => {
    const node = <Node>{};
    const previousVNode = vText<Node>(asSignal("A"));
    previousVNode[VNodeProps.NODE_REF] = node;
    const vNode = vText<Node>(asSignal("B"));

    const changeSets = update(vNode, previousVNode, attachmentRef());

    expect(changeSets.length).toStrictEqual(1);
    expect(changeSets[0][Props.Type]).toStrictEqual(Type.Text);
    expect(changeSets[0][Props.Action]).toStrictEqual(Action.Replace);
    // The replace handler needs the existing DOM node to rebind it.
    assert(vNode[VNodeProps.NODE_REF] === node);
  });

  test("replace the node when signals swap with equal values", () => {
    const previousVNode = vText<Node>(asSignal("same"));
    const vNode = vText<Node>(asSignal("same"));

    const changeSets = update(vNode, previousVNode, attachmentRef());

    expect(changeSets.length).toStrictEqual(1);
    expect(changeSets[0][Props.Action]).toStrictEqual(Action.Replace);
  });

  test("replace the node when a string becomes a signal", () => {
    const previousVNode = vText<Node>("static");
    const vNode = vText<Node>(asSignal("reactive"));

    const changeSets = update(vNode, previousVNode, attachmentRef());

    expect(changeSets.length).toStrictEqual(1);
    expect(changeSets[0][Props.Action]).toStrictEqual(Action.Replace);
  });

  test("replace the node when a signal becomes a string", () => {
    const sig = signal("reactive");
    const previousVNode = vText<Node>(<JSX.SignalLike>(<unknown>sig));
    const vNode = vText<Node>("static");
    // The in-place vNode update keeps the old signal's subscription
    // alive until the diff commits.
    bind(vNode, sig);

    const changeSets = update(vNode, previousVNode, attachmentRef());

    expect(changeSets.length).toStrictEqual(1);
    expect(changeSets[0][Props.Action]).toStrictEqual(Action.Replace);
  });

  test("rebind when the subscription does not match the binding", () => {
    const oldSig = signal("old");
    const vNode = vText<Node>(asSignal("new"));
    // An aborted pass already recorded the new signal while the old
    // subscription stayed committed - the snapshot shows no delta, so
    // only the subscription itself can reveal the needed rebind.
    bind(vNode, oldSig);
    const previousVNode = snapshot(vNode);

    const changeSets = update(vNode, previousVNode, attachmentRef());

    expect(changeSets.length).toStrictEqual(1);
    expect(changeSets[0][Props.Action]).toStrictEqual(Action.Replace);
  });

  test("patch the text content for plain string changes", () => {
    const previousVNode = vText<Node>("Hello World");
    const vNode = vText<Node>("Hello Univers");

    const changeSets = update(vNode, previousVNode, attachmentRef());

    expect(changeSets.length).toStrictEqual(2);
    expect(changeSets[0][Props.Action]).toStrictEqual(Action.Link);
    expect(changeSets[1][Props.Action]).toStrictEqual(Action.Update);
  });

  test("only link when the string is unchanged", () => {
    const previousVNode = vText<Node>("Hello World");
    const vNode = vText<Node>("Hello World");

    const changeSets = update(vNode, previousVNode, attachmentRef());

    expect(changeSets.length).toStrictEqual(1);
    expect(changeSets[0][Props.Action]).toStrictEqual(Action.Link);
  });
});
