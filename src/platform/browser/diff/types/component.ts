import { type VComponent, VHook, VNodeProps } from "../../../../v-node/mod.ts";
import { Action, type ChangeSet, Props, type Type } from "../dispatch.ts";

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

export interface UnmountComponentPayload {
  vNode: VComponent<Node>;
}

export interface UnmountComponentChangeSet
  extends BaseComponentChangeSet<UnmountComponentPayload> {
  [Props.Action]: Action.Unmount;
}

export type ComponentChangeSet =
  | MountComponentChangeSet
  | UnmountComponentChangeSet;

export function component(change: ComponentChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Mount: {
      return mount(change[Props.Payload]);
    }
    case Action.Unmount:
      return unmount(change[Props.Payload]);
  }
}

function mount(payload: MountComponentPayload): void {
  // Run lifecycle "onMount" hooks associated with this element.
  payload.vNode[VNodeProps.HOOKS]?.[VHook.ON_MOUNT]?.forEach((hook) => {
    const onUnmount = hook();
    if (typeof onUnmount === "function" && payload.vNode[VNodeProps.HOOKS]) {
      if (Array.isArray(payload.vNode[VNodeProps.HOOKS][VHook.ON_UNMOUNT])) {
        payload.vNode[VNodeProps.HOOKS][VHook.ON_UNMOUNT].push(onUnmount);
        return;
      }
      payload.vNode[VNodeProps.HOOKS][VHook.ON_UNMOUNT] = [onUnmount];
    }
  });
}

function unmount(payload: UnmountComponentPayload): void {
  payload.vNode[VNodeProps.HOOKS]?.[VHook.ON_UNMOUNT]?.forEach((hook) => {
    hook();
  });
}
