import type { JSX } from "../../../../jsx-runtime/jsx.ts";
import { setSubscriber } from "../../../../signal/mod.ts";
import { flushCleanups, VNodeProps, type VSignal, type VText } from "../../../../v-node/mod.ts";
import { type AttachmentRef, AttachmentType, moveAttachmentRef } from "../attachment-ref.ts";
import { Action, type ChangeSet, Props, type Type } from "../dispatch.ts";
import { isSignal } from "../update.ts";
import { toText } from "../../../../utils/text.ts";

interface BaseTextChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Text;
}

export interface CreateTextPayload {
  vText: VText<Node>;
}

export interface AttachTextPayload {
  vText: VText<Node>;
  attachmentRef: AttachmentRef;
}

export interface LinkTextPayload {
  vText: VText<Node>;
  node: Node;
  attachmentRef: AttachmentRef;
}

export interface ReplaceTextPayload {
  vText: VText<Node>;
  attachmentRef: AttachmentRef;
}

export interface UpdateTextPayload {
  vText: VText<Node>;
}

export interface DeleteTextPayload {
  vText: VText<Node>;
}

export interface CreateTextChangeSet extends BaseTextChangeSet<CreateTextPayload> {
  [Props.Action]: Action.Create;
}

export interface AttachTextChangeSet extends BaseTextChangeSet<AttachTextPayload> {
  [Props.Action]: Action.Attach;
}

export interface LinkTextChangeSet extends BaseTextChangeSet<LinkTextPayload> {
  [Props.Action]: Action.Link;
}

export interface ReplaceTextChangeSet extends BaseTextChangeSet<ReplaceTextPayload> {
  [Props.Action]: Action.Replace;
}

export interface UpdateTextChangeSet extends BaseTextChangeSet<UpdateTextPayload> {
  [Props.Action]: Action.Update;
}

export interface DeleteTextChangeSet extends BaseTextChangeSet<DeleteTextPayload> {
  [Props.Action]: Action.Delete;
}

export type TextChangeSet =
  | CreateTextChangeSet
  | AttachTextChangeSet
  | LinkTextChangeSet
  | ReplaceTextChangeSet
  | UpdateTextChangeSet
  | DeleteTextChangeSet;

export function text(change: TextChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Create:
      return create(<CreateTextPayload>change[Props.Payload]);
    case Action.Attach:
      return attach(<AttachTextPayload>change[Props.Payload]);
    case Action.Link:
      return link(<LinkTextPayload>change[Props.Payload]);
    case Action.Replace:
      return replace(<ReplaceTextPayload>change[Props.Payload]);
    case Action.Update:
      return update(<UpdateTextPayload>change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteTextPayload>change[Props.Payload]);
  }
}

function createBoundNode(vText: VText<Node>): Text {
  let node: Text;

  if (isSignal(vText)) {
    const signal = vText[VNodeProps.TEXT];
    node = setSubscriber(
      () => {
        return new Text(toText(signal));
      },
      {
        update: (value: JSX.SignalValue) => {
          node.textContent = String(value);
        },
        cleanupCallback(cleanup) {
          vText[VNodeProps.CLEANUP].push(cleanup);
        },
      },
    );
  } else {
    node = new Text(toText(vText[VNodeProps.TEXT]));
  }

  return node;
}

function create({ vText }: CreateTextPayload): void {
  vText[VNodeProps.NODE_REF] = createBoundNode(vText);
}

function attach({ vText, attachmentRef }: AttachTextPayload): void {
  const node = vText[VNodeProps.NODE_REF];
  if (!node) return;
  if (attachmentRef.type === AttachmentType.Parent) {
    attachmentRef.vNode[VNodeProps.NODE_REF]?.insertBefore(
      node,
      attachmentRef.vNode[VNodeProps.NODE_REF]?.firstChild,
    );
  } else {
    attachmentRef.node.parentNode?.insertBefore(node, attachmentRef.node.nextSibling);
  }
  moveAttachmentRef(attachmentRef, node);
}

function link({ vText, node, attachmentRef }: LinkTextPayload): void {
  vText[VNodeProps.NODE_REF] = node;
  if (isSignal(vText)) bindSignal(vText, node);
  moveAttachmentRef(attachmentRef, node);
}

/*
 * Replaces the text BINDING, not the DOM node: attachment anchors stored
 * elsewhere (component self-update refs, island roots) point at this node
 * and would silently break if its identity changed.
 */
function replace({ vText, attachmentRef }: ReplaceTextPayload): void {
  const node = vText[VNodeProps.NODE_REF];
  if (!node) return;

  // Commit point of the binding swap: the previous signal's subscription
  // is dropped only here, so an update pass that aborts before dispatch
  // leaves the old binding fully live.
  flushCleanups(vText);

  // Rebinding in place only works on an actual Text node. Hydration's
  // divergence path can hand us any node kind - those are structurally
  // replaced instead.
  if (node.nodeType !== 3 /* Node.TEXT_NODE */) {
    const replacement = createBoundNode(vText);
    node.parentNode?.replaceChild(replacement, node);
    vText[VNodeProps.NODE_REF] = replacement;
    moveAttachmentRef(attachmentRef, replacement);
    return;
  }

  if (isSignal(vText)) {
    bindSignal(vText, node);
  } else {
    node.textContent = toText(vText[VNodeProps.TEXT]);
  }

  moveAttachmentRef(attachmentRef, node);
}

/** Shows the current value of `vText`'s signal in `node`, and every later one. */
function bindSignal(vText: VText<Node> & { [VNodeProps.TEXT]: VSignal }, node: Node): void {
  const signal = vText[VNodeProps.TEXT];
  setSubscriber(
    () => {
      const text = toText(signal);
      // Hydration links nodes that already show the text.
      if (node.textContent !== text) node.textContent = text;
    },
    {
      update: (value: JSX.SignalValue) => {
        node.textContent = String(value);
      },
      cleanupCallback: (cleanup) => {
        vText[VNodeProps.CLEANUP].push(cleanup);
      },
    },
  );
}

function update({ vText }: UpdateTextPayload): void {
  const node = vText[VNodeProps.NODE_REF];
  if (!node) return;
  node.textContent = toText(vText[VNodeProps.TEXT]);
}

function remove({ vText }: DeleteTextPayload): void {
  const node = vText[VNodeProps.NODE_REF];
  flushCleanups(vText);
  if (node) {
    node.parentNode?.removeChild(node);
  }
}
