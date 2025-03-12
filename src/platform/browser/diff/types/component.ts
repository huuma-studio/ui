import { type VComponent, VHook, VNodeProps } from "../../../../v-node/mod.ts";
import { type AttachmentRef, copyAttachmentRefTo } from "../attachment-ref.ts";
import { Action, type ChangeSet, Props, type Type } from "../dispatch.ts";

interface BaseComponentChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Component;
}

export interface LinkComponentPayload {
  vComponent: VComponent<Node>;
  attachmentRef: AttachmentRef;
}

export interface LinkComponentChangeSet
  extends BaseComponentChangeSet<LinkComponentPayload> {
  [Props.Action]: Action.Link;
}

export interface MountComponentPayload {
  vComponent: VComponent<Node>;
}

export interface MountComponentChangeSet
  extends BaseComponentChangeSet<MountComponentPayload> {
  [Props.Action]: Action.Mount;
}

export interface UnmountComponentPayload {
  vComponent: VComponent<Node>;
}

export interface UnmountComponentChangeSet
  extends BaseComponentChangeSet<UnmountComponentPayload> {
  [Props.Action]: Action.Unmount;
}

export type ComponentChangeSet =
  | LinkComponentChangeSet
  | MountComponentChangeSet
  | UnmountComponentChangeSet;

export function component(change: ComponentChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Link: {
      return link(<LinkComponentPayload> change[Props.Payload]);
    }
    case Action.Mount: {
      return mount(change[Props.Payload]);
    }
    case Action.Unmount:
      return unmount(change[Props.Payload]);
  }
}

function link({ vComponent, attachmentRef }: LinkComponentPayload): void {
  copyAttachmentRefTo(vComponent, attachmentRef);
}

function mount({ vComponent }: MountComponentPayload): void {
  // Run lifecycle "onMount" hooks associated with this element.
  vComponent[VNodeProps.HOOKS]?.[VHook.MOUNT]?.forEach((hook) => {
    const onUnmount = hook();
    if (typeof onUnmount === "function" && vComponent[VNodeProps.HOOKS]) {
      if (Array.isArray(vComponent[VNodeProps.HOOKS][VHook.UNMOUNT])) {
        vComponent[VNodeProps.HOOKS][VHook.UNMOUNT].push(onUnmount);
        return;
      }
      vComponent[VNodeProps.HOOKS][VHook.UNMOUNT] = [onUnmount];
    }
  });
}

function unmount({ vComponent }: UnmountComponentPayload): void {
  vComponent[VNodeProps.HOOKS]?.[VHook.UNMOUNT]?.forEach((hook) => {
    hook();
  });
}
