import {
  type HasVNodeRef,
  isVComponent,
  isVElement,
  isVFragment,
  isVText,
  type VComponent,
  type VNode,
  VNodeProps,
} from "../../../v-node/mod.ts";

export enum AttachmentType {
  Parent,
  Sibling,
}

export type AttachmentRef = SiblingAttachmentRef | ParentAttachmentRef;

export interface SiblingAttachmentRef {
  type: AttachmentType.Sibling;
  node: Node;
}

export interface ParentAttachmentRef {
  type: AttachmentType.Parent;
  vNode: HasVNodeRef<Node>;
}

export function moveAttachmentRef(attachmentRef: AttachmentRef, node: Node): void {
  attachmentRef.type = AttachmentType.Sibling;
  (<SiblingAttachmentRef>attachmentRef).node = node;
  (<Partial<ParentAttachmentRef>>attachmentRef).vNode = undefined;
}

export function parentFromAttachmentRef(attachmentRef: AttachmentRef): Node {
  const parentNode =
    attachmentRef.type === AttachmentType.Parent
      ? attachmentRef.vNode[VNodeProps.NODE_REF]
      : attachmentRef.node.parentNode;
  if (!parentNode) throw RangeError("No dom node parent found");
  return parentNode;
}

export function createRootAttachmentRef(node?: Node | null): AttachmentRef {
  const previousSibling = skipCommentNodes(node?.previousSibling);
  const attachmentRef = previousSibling
    ? <SiblingAttachmentRef>{
        type: AttachmentType.Sibling,
        node: previousSibling,
      }
    : node?.parentNode
      ? <ParentAttachmentRef>{
          type: AttachmentType.Parent,
          vNode: {
            [VNodeProps.NODE_REF]: node.parentNode,
          },
        }
      : undefined;

  if (!attachmentRef) {
    throw new Error("Not parent node found for given node.");
  }

  return attachmentRef;
}

function skipCommentNodes(node?: Node | null): Node | undefined | null {
  if (node?.nodeType === Node.COMMENT_NODE) {
    return skipCommentNodes(node.previousSibling);
  }
  return node;
}

export function copyAttachmentRefTo(
  vComponent: VComponent<Node>,
  attachmentRef: AttachmentRef,
): void {
  if (attachmentRef.type === AttachmentType.Parent) {
    vComponent[VNodeProps.OPTIONS].ATTACHMENT_REF = <ParentAttachmentRef>{
      type: attachmentRef.type,
      vNode: { ...attachmentRef.vNode },
    };
  } else {
    vComponent[VNodeProps.OPTIONS].ATTACHMENT_REF = {
      type: attachmentRef.type,
      node: attachmentRef.node,
    };
  }
}

export function attachmentRefFrom(vComponent: VComponent<Node>): AttachmentRef | undefined {
  const attachmentRef = <AttachmentRef | undefined>vComponent[VNodeProps.OPTIONS].ATTACHMENT_REF;
  return attachmentRef ? { ...attachmentRef } : undefined;
}

/**
 * Where `vComponent` attaches its next render. The stored ref anchors on
 * the node before the component when it last rendered - a node another
 * component (e.g. a sibling island) may since have replaced or removed.
 * While the component shows a node, the node's current place wins.
 */
export function currentAttachmentRef(vComponent: VComponent<Node>): AttachmentRef | undefined {
  const first = firstNode(vComponent);
  if (first?.parentNode) {
    const previousSibling = skipCommentNodes(first.previousSibling);
    return previousSibling
      ? { type: AttachmentType.Sibling, node: previousSibling }
      : { type: AttachmentType.Parent, vNode: { [VNodeProps.NODE_REF]: first.parentNode } };
  }
  return attachmentRefFrom(vComponent);
}

function firstNode(vNode: VNode<Node>): Node | undefined {
  if (isVComponent(vNode)) return firstNode(vNode[VNodeProps.AST]);
  if (isVFragment(vNode)) {
    for (const child of vNode[VNodeProps.CHILDREN] ?? []) {
      const node = firstNode(child);
      if (node) return node;
    }
    return undefined;
  }
  if (isVElement(vNode) || isVText(vNode)) return vNode[VNodeProps.NODE_REF];
  return undefined;
}
