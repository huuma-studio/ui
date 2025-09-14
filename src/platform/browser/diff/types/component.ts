import {
  type VComponent,
  VHook,
  VMode,
  VNodeProps,
} from "../../../../v-node/mod.ts";
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

export type ComponentChangeSet =
  | LinkComponentChangeSet
  | MountComponentChangeSet;

export function component(change: ComponentChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Link: {
      return link(<LinkComponentPayload> change[Props.Payload]);
    }
    case Action.Mount: {
      return mount(change[Props.Payload]);
    }
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
      if (Array.isArray(vComponent[VNodeProps.HOOKS][VHook.DESTROY])) {
        vComponent[VNodeProps.HOOKS][VHook.DESTROY].push(onUnmount);
        return;
      }
      vComponent[VNodeProps.HOOKS][VHook.DESTROY] = [onUnmount];
    }
  });
  vComponent[VNodeProps.MODE] = VMode.Mounted;
}
