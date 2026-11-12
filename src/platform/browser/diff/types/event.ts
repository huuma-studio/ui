import { type VNode, type HasVNodeRef, VNodeProps } from "../../../../v-node/mod.ts";
import { Action, type ChangeSet, Props, type Type } from "../dispatch.ts";
import type { JSX } from "../../../../jsx-runtime/mod.ts";
import { batch } from "../../../../signal/batch.ts";

interface BaseEventChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Event;
}

export interface CreateEventPayload extends JSX.EventRef {
  vNode: VNode<Node>;
}

export interface DeleteEventPayload extends JSX.EventRef {
  vNode: VNode<Node>;
}

export interface CreateEventChangeSet extends BaseEventChangeSet<CreateEventPayload> {
  [Props.Action]: Action.Create;
}

export interface DeleteEventChangeSet extends BaseEventChangeSet<DeleteEventPayload> {
  [Props.Action]: Action.Delete;
}

export type EventChangeSet = CreateEventChangeSet | DeleteEventChangeSet;

export function event(change: EventChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Create:
      return create(<CreateEventPayload>change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteEventPayload>change[Props.Payload]);
  }
}

// A listener that sets several signals updates the DOM once: it runs in a
// batch. The same wrapper per listener, for removeEventListener().
const batchedListeners = new WeakMap<() => void, EventListener>();

function batched(listener: () => void): EventListener {
  let wrapper = batchedListeners.get(listener);
  if (!wrapper) {
    wrapper = function (this: unknown, event: Event) {
      return batch(() => (<(this: unknown, event: Event) => void>listener).call(this, event));
    };
    batchedListeners.set(listener, wrapper);
  }
  return wrapper;
}

function create(payload: CreateEventPayload): void {
  (<HasVNodeRef<Node>>payload.vNode)[VNodeProps.NODE_REF]?.addEventListener(
    payload.name,
    batched(payload.listener),
  );
}

function remove(payload: DeleteEventPayload): void {
  (<HasVNodeRef<Node>>payload.vNode)[VNodeProps.NODE_REF]?.removeEventListener(
    payload.name,
    batched(payload.listener),
  );
}
