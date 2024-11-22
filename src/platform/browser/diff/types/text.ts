// TODO: replace with dedicated VState type
import type { State } from "../../../../state/mod.ts";
import {
  type VNode,
  type HasVNodeRef,
  type VText,
  VNodeProps,
  type VState,
} from "../../../../v-node/mod.ts";
import { Action, type ChangeSet, Props, type Type } from "../dispatch.ts";
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
      return create(<CreateTextPayload>change[Props.Payload]);
    case Action.Attach:
      return attach(<AttachTextPayload>change[Props.Payload]);
    case Action.Replace:
      return replace(<ReplaceTextPayload>change[Props.Payload]);
    case Action.Update:
      return update(<UpdateTextPayload>change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteTextPayload>change[Props.Payload]);
  }
}

function create(payload: CreateTextPayload): void {
  let text: Text;

  if (
    typeof payload.vNode[VNodeProps.TEXT] === "object" &&
    "get" in payload.vNode[VNodeProps.TEXT]
  ) {
    const state = <State<string | number>>payload.vNode[VNodeProps.TEXT];
    text = new Text(`${state.get}`);
    state.subscribe({
      update: (value: string | number) => {
        text.textContent = `${value}`;
      },
    });
  } else {
    text = new Text(`${payload.vNode[VNodeProps.TEXT]}`);
  }

  const vNode = payload.vNode;
  vNode[VNodeProps.NODE_REF] = text;
}

function attach(payload: AttachTextPayload): void {
  (<Node>(
    (<HasVNodeRef<Node>>payload.parentVNode)[VNodeProps.NODE_REF]
  )).appendChild(<Node>payload.vNode[VNodeProps.NODE_REF]);
}

function replace(payload: ReplaceTextPayload): void {
  let text: Text;

  if (
    typeof payload.vNode[VNodeProps.TEXT] === "object" &&
    "get" in payload.vNode[VNodeProps.TEXT]
  ) {
    const state = <VState>payload.vNode[VNodeProps.TEXT];
    text = new Text(`${state.get}`);
    state.subscribe({
      update: (value: string | number) => {
        text.textContent = `${value}`;
      },
    });
  } else {
    text = new Text(`${payload.vNode[VNodeProps.TEXT]}`);
  }

  payload.vNode[VNodeProps.NODE_REF]?.parentNode?.replaceChild(
    text,
    payload.vNode[VNodeProps.NODE_REF],
  );
  payload.vNode[VNodeProps.NODE_REF] = text;
}

function update(payload: UpdateTextPayload): void {
  (<Text>payload.vNode[VNodeProps.NODE_REF]).textContent = isState(
    payload.vNode,
  )
    ? `${(<VState>payload.vNode[VNodeProps.TEXT]).get}`
    : `${payload.vNode[VNodeProps.TEXT]}`;
}

function remove(payload: DeleteTextPayload): void {
  (<Text>payload.vNode[VNodeProps.NODE_REF]).remove();
}
