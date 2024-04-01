/// <reference lib="dom" />
import { VNode, VNodeRef } from "../../../../ast.ts";
import { Action, ChangeSet, Props, Type } from "../dispatch.ts";

interface BaseEventChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Event;
}

export interface CreateEventPayload extends JSX.EventRef {
  vNode: VNode<Node>;
}

export interface DeleteEventPayload extends JSX.EventRef {
  vNode: VNode<Node>;
}

export interface CreateEventChangeSet
  extends BaseEventChangeSet<CreateEventPayload> {
  [Props.Action]: Action.Create;
}

export interface DeleteEventChangeSet
  extends BaseEventChangeSet<DeleteEventPayload> {
  [Props.Action]: Action.Delete;
}

export type EventChangeSet = CreateEventChangeSet | DeleteEventChangeSet;

export function event(change: EventChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Create:
      return create(<CreateEventPayload> change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteEventPayload> change[Props.Payload]);
  }
}

function create(
  payload: CreateEventPayload,
): void {
  (<VNodeRef<Node>> payload.vNode).nodeRef?.addEventListener(
    payload.name,
    payload.listener,
  );
}

function remove(
  payload: DeleteEventPayload,
): void {
  (<VNodeRef<Node>> payload.vNode).nodeRef?.removeEventListener(
    payload.name,
    payload.listener,
  );
}
