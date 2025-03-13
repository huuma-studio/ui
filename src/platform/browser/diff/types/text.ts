import {
  VNodeProps,
  type VSignal,
  type VText,
} from "../../../../v-node/mod.ts";
import {
  type AttachmentRef,
  AttachmentType,
  moveAttachmentRef,
} from "../attachment-ref.ts";
import { Action, type ChangeSet, Props, type Type } from "../dispatch.ts";
import { isSignal } from "../update.ts";

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

export interface CreateTextChangeSet
  extends BaseTextChangeSet<CreateTextPayload> {
  [Props.Action]: Action.Create;
}

export interface AttachTextChangeSet
  extends BaseTextChangeSet<AttachTextPayload> {
  [Props.Action]: Action.Attach;
}

export interface LinkTextChangeSet extends BaseTextChangeSet<LinkTextPayload> {
  [Props.Action]: Action.Link;
}

export interface ReplaceTextChangeSet
  extends BaseTextChangeSet<ReplaceTextPayload> {
  [Props.Action]: Action.Replace;
}

export interface UpdateTextChangeSet
  extends BaseTextChangeSet<UpdateTextPayload> {
  [Props.Action]: Action.Update;
}

export interface DeleteTextChangeSet
  extends BaseTextChangeSet<DeleteTextPayload> {
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
      return create(<CreateTextPayload> change[Props.Payload]);
    case Action.Attach:
      return attach(<AttachTextPayload> change[Props.Payload]);
    case Action.Link:
      return link(<LinkTextPayload> change[Props.Payload]);
    case Action.Replace:
      return replace(<ReplaceTextPayload> change[Props.Payload]);
    case Action.Update:
      return update(<UpdateTextPayload> change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteTextPayload> change[Props.Payload]);
  }
}

function create({ vText }: CreateTextPayload): void {
  let node: Text;

  if (
    typeof vText[VNodeProps.TEXT] === "object" &&
    "get" in vText[VNodeProps.TEXT]
  ) {
    const signal = vText[VNodeProps.TEXT];
    node = new Text(`${signal.get()}`);
    signal.subscribe({
      update: (value: string | number) => {
        node.textContent = `${value}`;
      },
      cleanupCallback(cleanup) {
        vText[VNodeProps.CLEANUP].push(cleanup);
      },
    });
  } else {
    node = new Text(`${vText[VNodeProps.TEXT]}`);
  }

  vText[VNodeProps.NODE_REF] = node;
}

function attach({ vText, attachmentRef }: AttachTextPayload): void {
  const node = vText[VNodeProps.NODE_REF];
  if (!node) return;
  if (attachmentRef.type === AttachmentType.Parent) {
    attachmentRef.vNode[VNodeProps.NODE_REF]?.appendChild(
      node,
    );
  } else {
    attachmentRef.node.parentNode?.insertBefore(
      node,
      attachmentRef.node.nextSibling,
    );
  }
  moveAttachmentRef(attachmentRef, node);
}

function link({ vText, node, attachmentRef }: LinkTextPayload): void {
  vText[VNodeProps.NODE_REF] = node;
  moveAttachmentRef(attachmentRef, node);
}

function replace({ vText, attachmentRef }: ReplaceTextPayload): void {
  let node: Text;

  if (
    typeof vText[VNodeProps.TEXT] === "object" &&
    "get" in vText[VNodeProps.TEXT]
  ) {
    const signal = <VSignal> vText[VNodeProps.TEXT];
    node = new Text(`${signal.get()}`);

    signal.subscribe({
      update: (value: string | number) => {
        node.textContent = `${value}`;
      },
      cleanupCallback: (cleanup) => {
        vText[VNodeProps.CLEANUP].push(cleanup);
      },
    });
  } else {
    node = new Text(`${vText[VNodeProps.TEXT]}`);
  }

  vText[VNodeProps.NODE_REF]?.parentNode?.replaceChild(
    node,
    vText[VNodeProps.NODE_REF],
  );
  vText[VNodeProps.NODE_REF] = node;
  moveAttachmentRef(attachmentRef, node);
}

function update({ vText }: UpdateTextPayload): void {
  const node = vText[VNodeProps.NODE_REF];
  if (!node) return;
  node.textContent = isSignal(
      vText,
    )
    ? `${(<VSignal> vText[VNodeProps.TEXT]).get()}`
    : `${vText[VNodeProps.TEXT]}`;
}

function remove({ vText }: DeleteTextPayload): void {
  const node = vText[VNodeProps.NODE_REF];
  vText[VNodeProps.CLEANUP].forEach((cleanup) => cleanup());
  if (node) {
    node.parentNode?.removeChild(node);
  }
}
