import { type VElement, VNodeProps, VType } from "../../../../v-node/mod.ts";
import { Action, type ChangeSet, Props, type Type } from "../dispatch.ts";

interface BaseElementChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Element;
}

export interface CreateElementPayload {
  parentVNode: VElement<Node>;
  vNode: VElement<Node>;
}

export interface LinkElementPayload {
  vNode: VElement<Node>;
  node: Node;
}

export interface MountElementPayload {
  vNode: VElement<Node>;
}

export interface AttachElementPayload {
  parentVNode: VElement<Node>;
  vNode: VElement<Node>;
}

export interface ReplaceElementPayload {
  vNode: VElement<Node>;
  node: Node;
}

export interface UpdateElementPayload {
  parentVNode: VElement<Node>;
  node: Node;
  vNode: VElement<Node>;
}

export interface RemoveElementPayload {
  vNode: VElement<Node>;
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

export interface RemoveElementChangeSet
  extends BaseElementChangeSet<RemoveElementPayload> {
  [Props.Action]: Action.Delete;
}

export type ElementChangeSet =
  | CreateElementChangeSet
  | LinkElementChangeSet
  | AttachElementChangeSet
  | ReplaceElementChangeSet
  | UpdateElementChangeSet
  | RemoveElementChangeSet;

export function element(change: ElementChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Create:
      return create(<CreateElementPayload>change[Props.Payload]);
    case Action.Link:
      return link(<LinkElementPayload>change[Props.Payload]);
    case Action.Attach:
      return attach(<AttachElementPayload>change[Props.Payload]);
    case Action.Replace:
      return replace(<ReplaceElementPayload>change[Props.Payload]);
    case Action.Update:
      return update(<UpdateElementPayload>change[Props.Payload]);
    case Action.Delete:
      return remove(<RemoveElementPayload>change[Props.Payload]);
  }
}

function create(payload: CreateElementPayload): void {
  if (!payload.vNode && !payload.parentVNode[VNodeProps.NODE_REF]) return;
  payload.vNode[VNodeProps.NODE_REF] = createElement(
    payload.vNode,
    <Node>payload.parentVNode[VNodeProps.NODE_REF],
  );
}

function link(payload: LinkElementPayload): void {
  payload.vNode[VNodeProps.NODE_REF] = payload.node;
}

function attach(payload: AttachElementPayload): void {
  if (
    payload.vNode.type === VType.ELEMENT &&
    payload.vNode[VNodeProps.NODE_REF]
  ) {
    (<Node>payload.parentVNode[VNodeProps.NODE_REF])?.appendChild(
      payload.vNode[VNodeProps.NODE_REF],
    );
  }
}

function replace(payload: ReplaceElementPayload): void {
  if (payload.vNode.type === VType.ELEMENT) {
    const node = createElement(
      payload.vNode,
      <Node>(<Node>payload.node).parentNode,
    );

    payload.node?.parentNode?.replaceChild(node, payload.node);

    payload.vNode[VNodeProps.NODE_REF] = node;
  }
}

function update(payload: UpdateElementPayload): void {
  (<Node>payload.parentVNode[VNodeProps.NODE_REF]).replaceChild(
    <Node>payload.vNode[VNodeProps.NODE_REF],
    payload.node,
  );
}

function remove(payload: RemoveElementPayload): void {
  (<HTMLElement>payload.vNode[VNodeProps.NODE_REF]).remove();
  payload.vNode[VNodeProps.NODE_REF] = undefined;
}

function createElement(vNode: VElement<Node>, parentNode: Node): Node {
  return isSVG(vNode[VNodeProps.TAG], parentNode)
    ? document.createElementNS(
        "http://www.w3.org/2000/svg",
        vNode[VNodeProps.TAG],
      )
    : document.createElement(vNode[VNodeProps.TAG]);
}

function isSVG(tag: string, parentNode: Node): boolean {
  return (
    tag === "svg" ||
    typeof (<SVGElement>parentNode).ownerSVGElement !== "undefined"
  );
}
