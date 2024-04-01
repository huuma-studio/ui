// TODO: replace with dedicated VState type
import { VNode, VNodeRef, VState, VText } from "../../../../ast.ts";
import { Action, ChangeSet, Props, Type } from "../dispatch.ts";
import { isState } from "../update.ts";

interface BaseTextChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Text;
}

export interface CreateTextPayload {
  vNode: VText<Node>;
}

export interface AttachTextPayload {
  parentVNode: VNode<Node>;
  vNode: VText<Node>;
}

export interface ReplaceTextPayload {
  vNode: VText<Node>;
}

export interface UpdateTextPayload {
  vNode: VText<Node>;
}

export interface DeleteTextPayload {
  vNode: VText<Node>;
}

export interface CreateTextChangeSet
  extends BaseTextChangeSet<CreateTextPayload> {
  [Props.Action]: Action.Create;
}

export interface AttachTextChangeSet
  extends BaseTextChangeSet<AttachTextPayload> {
  [Props.Action]: Action.Attach;
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
  | ReplaceTextChangeSet
  | UpdateTextChangeSet
  | DeleteTextChangeSet;

export function text(change: TextChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Create:
      return create(<CreateTextPayload> change[Props.Payload]);
    case Action.Attach:
      return attach(<AttachTextPayload> change[Props.Payload]);
    case Action.Replace:
      return replace(<ReplaceTextPayload> change[Props.Payload]);
    case Action.Update:
      return update(<UpdateTextPayload> change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteTextPayload> change[Props.Payload]);
  }
}

function create(payload: CreateTextPayload): void {
  let text: Text;

  if (typeof payload.vNode.text === "object" && "get" in payload.vNode.text) {
    const state = <VState> payload.vNode.text;
    text = new Text(`${state.get}`);
    state.subscribe({
      update: (value: string | number) => {
        text.textContent = `${value}`;
      },
    });
  } else {
    text = new Text(`${payload.vNode.text}`);
  }

  const vNode = payload.vNode;
  vNode.nodeRef = text;
}

function attach(payload: AttachTextPayload): void {
  (<Node> (<VNodeRef<Node>> payload.parentVNode).nodeRef).appendChild(
    <Node> payload.vNode.nodeRef,
  );
}

function replace(payload: ReplaceTextPayload): void {
  let text: Text;

  if (typeof payload.vNode.text === "object" && "get" in payload.vNode.text) {
    const state = <VState> payload.vNode.text;
    text = new Text(`${state.get}`);
    state.subscribe({
      update: (value: string | number) => {
        text.textContent = `${value}`;
      },
    });
  } else {
    text = new Text(`${payload.vNode.text}`);
  }

  payload.vNode.nodeRef?.parentNode?.replaceChild(text, payload.vNode.nodeRef);
  payload.vNode.nodeRef = text;
}

function update(payload: UpdateTextPayload): void {
  (<Text> payload.vNode.nodeRef).textContent = isState(payload.vNode)
    ? `${(<VState> payload.vNode.text).get}`
    : `${payload.vNode.text}`;
}

function remove(payload: DeleteTextPayload): void {
  (<Text> payload.vNode.nodeRef).remove();
}
