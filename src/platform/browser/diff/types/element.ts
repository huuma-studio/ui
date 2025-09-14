import { type VElement, VNodeProps } from "../../../../v-node/mod.ts";
import {
  type AttachmentRef,
  AttachmentType,
  moveAttachmentRef,
  parentFromAttachmentRef,
} from "../attachment-ref.ts";

import { Action, type ChangeSet, Props, type Type } from "../dispatch.ts";

interface BaseElementChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Element;
}

export interface CreateElementPayload {
  vElement: VElement<Node>;
  attachmentRef: AttachmentRef;
}

export interface LinkElementPayload {
  vElement: VElement<Node>;
  node: Node;
  attachmentRef: AttachmentRef;
}

export interface AttachElementPayload {
  vElement: VElement<Node>;
  attachmentRef: AttachmentRef;
}

export interface ReplaceElementPayload {
  vElement: VElement<Node>;
  node: Node;
  attachmentRef: AttachmentRef;
}

export interface UpdateElementPayload {
  vElement: VElement<Node>;
  node: Node;
  attachmentRef: AttachmentRef;
}

export interface DeleteElementPayload {
  vElement: VElement<Node>;
}

export interface CreateElementChangeSet
  extends BaseElementChangeSet<CreateElementPayload> {
  [Props.Action]: Action.Create;
}

export interface LinkElementChangeSet
  extends BaseElementChangeSet<LinkElementPayload> {
  [Props.Action]: Action.Link;
}

export interface AttachElementChangeSet
  extends BaseElementChangeSet<AttachElementPayload> {
  [Props.Action]: Action.Attach;
}

export interface ReplaceElementChangeSet
  extends BaseElementChangeSet<ReplaceElementPayload> {
  [Props.Action]: Action.Replace;
}

export interface UpdateElementChangeSet
  extends BaseElementChangeSet<UpdateElementPayload> {
  [Props.Action]: Action.Update;
}

export interface DeleteElementChangeSet
  extends BaseElementChangeSet<DeleteElementPayload> {
  [Props.Action]: Action.Delete;
}

export type ElementChangeSet =
  | CreateElementChangeSet
  | LinkElementChangeSet
  | AttachElementChangeSet
  | ReplaceElementChangeSet
  | UpdateElementChangeSet
  | DeleteElementChangeSet;

export function element(change: ElementChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Create:
      return create(<CreateElementPayload> change[Props.Payload]);
    case Action.Link:
      return link(<LinkElementPayload> change[Props.Payload]);
    case Action.Attach:
      return attach(<AttachElementPayload> change[Props.Payload]);
    case Action.Replace:
      return replace(<ReplaceElementPayload> change[Props.Payload]);
    case Action.Update:
      return update(<UpdateElementPayload> change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteElementPayload> change[Props.Payload]);
  }
}

function create({ vElement, attachmentRef }: CreateElementPayload): void {
  const node = createElement(
    vElement,
    attachmentRef,
  ).node;
  vElement[VNodeProps.NODE_REF] = node;
}

function link({ vElement, node, attachmentRef }: LinkElementPayload): void {
  vElement[VNodeProps.NODE_REF] = node;

  if (
    attachmentRef.type === AttachmentType.Parent &&
    node.previousSibling !== null &&
    node.parentElement !== attachmentRef.vNode[VNodeProps.NODE_REF]
  ) {
    // Remove current node
    node.parentNode?.removeChild(node);
    // Move current node to attachment node
    attachmentRef.vNode[VNodeProps.NODE_REF]?.insertBefore(
      node,
      attachmentRef.vNode[VNodeProps.NODE_REF]?.firstChild,
    );
  }

  if (
    attachmentRef.type === AttachmentType.Sibling &&
    attachmentRef.node !== node.previousSibling
  ) {
    // Remove current node
    node.parentNode?.removeChild(node);
    // Move current node to attachment node
    attachmentRef.node.parentNode?.insertBefore(
      node,
      attachmentRef.node.nextSibling,
    );
  }

  moveAttachmentRef(attachmentRef, node);
}

function attach({ vElement, attachmentRef }: AttachElementPayload): void {
  const node = vElement[VNodeProps.NODE_REF];
  if (!node) return;
  if (attachmentRef.type === AttachmentType.Parent) {
    attachmentRef.vNode[VNodeProps.NODE_REF]?.insertBefore(
      node,
      attachmentRef.vNode[VNodeProps.NODE_REF]?.firstChild,
    );
  }
  if (attachmentRef.type === AttachmentType.Sibling) {
    attachmentRef.node.parentNode?.insertBefore(
      node,
      attachmentRef.node.nextSibling,
    );
  }
  moveAttachmentRef(attachmentRef, node);
}

function replace(
  { vElement, node, attachmentRef }: ReplaceElementPayload,
): void {
  const { node: newNode, parentNode } = createElement(
    vElement,
    attachmentRef,
  );

  parentNode.replaceChild(newNode, node);

  vElement[VNodeProps.NODE_REF] = node;
  moveAttachmentRef(attachmentRef, newNode);
}

function update({ vElement, node, attachmentRef }: UpdateElementPayload): void {
  if (vElement[VNodeProps.NODE_REF]) {
    parentFromAttachmentRef(attachmentRef).replaceChild(
      vElement[VNodeProps.NODE_REF],
      node,
    );
    moveAttachmentRef(attachmentRef, vElement[VNodeProps.NODE_REF]);
  }
}

function remove({ vElement }: DeleteElementPayload): void {
  (<HTMLElement> vElement[VNodeProps.NODE_REF]).remove();
  vElement[VNodeProps.NODE_REF] = undefined;
}

function createElement(
  vElement: VElement<Node>,
  attachmentRef: AttachmentRef,
): { node: Node; parentNode: Node } {
  const parentNode = parentFromAttachmentRef(attachmentRef);
  const node = isSVG(
      vElement[VNodeProps.TAG],
      parentNode,
    )
    ? document.createElementNS(
      "http://www.w3.org/2000/svg",
      vElement[VNodeProps.TAG],
    )
    : document.createElement(vElement[VNodeProps.TAG]);

  return {
    node,
    parentNode,
  };
}

function isSVG(tag: string, parentNode: Node): boolean {
  return (
    tag === "svg" ||
    typeof (<SVGElement> parentNode).ownerSVGElement !== "undefined"
  );
}
