import { VComponent } from "../../../../ast.ts";
import { Action, ChangeSet, Props, Type } from "../dispatch.ts";

interface BaseComponentChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Component;
}

export interface MountComponentPayload {
  vNode: VComponent<Node>;
}

export interface MountComponentChangeSet
  extends BaseComponentChangeSet<MountComponentPayload> {
  [Props.Action]: Action.Mount;
}

export interface DestroyComponentPayload {
  vNode: VComponent<Node>;
}

export interface DestroyComponentChangeSet
  extends BaseComponentChangeSet<DestroyComponentPayload> {
  [Props.Action]: Action.Destroy;
}

export type ComponentChangeSet =
  | MountComponentChangeSet
  | DestroyComponentChangeSet;

export function component(change: ComponentChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Mount: {
      return mount(change[Props.Payload]);
    }
    case Action.Destroy:
      return destroy(change[Props.Payload]);
  }
}

function mount(payload: MountComponentPayload): void {
  // Run lifecycle "onMount" hooks associated with this element.
  payload.vNode.hooks?.onMount?.forEach((hook) => {
    const onDestroy = hook();
    if (typeof onDestroy === "function" && payload.vNode.hooks) {
      if (Array.isArray(payload.vNode.hooks.onDestroy)) {
        payload.vNode.hooks.onDestroy.push(onDestroy);
        return;
      }
      payload.vNode.hooks.onDestroy = [onDestroy];
    }
  });
}

function destroy(payload: DestroyComponentPayload): void {
  payload.vNode.hooks?.onDestroy?.forEach((hook) => {
    hook();
  });
}
