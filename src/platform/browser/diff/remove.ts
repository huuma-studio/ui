import { type VNode, VNodeProps, VType } from "../../../v-node/mod.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import type { UnmountComponentChangeSet } from "./types/component.ts";

export function remove(vNode: VNode<Node>): ChangeSet<unknown>[] {
  if (vNode?.type === VType.COMPONENT) {
    return [
      <UnmountComponentChangeSet>{
        [Props.Type]: Type.Component,
        [Props.Action]: Action.Unmount,
        [Props.Payload]: {
          vNode,
        },
      },
      ...remove(vNode[VNodeProps.AST]),
    ];
  }

  if (vNode?.type === VType.ELEMENT) {
    return [
      {
        [Props.Type]: Type.Element,
        [Props.Action]: Action.Delete,
        [Props.Payload]: {
          vNode,
        },
      },
    ];
  }

  if (vNode?.type === VType.TEXT) {
    return [
      {
        [Props.Type]: Type.Text,
        [Props.Action]: Action.Delete,
        [Props.Payload]: {
          vNode,
        },
      },
    ];
  }

  if (vNode?.type === VType.FRAGMENT) {
    const changes: ChangeSet<unknown>[] = [];
    vNode[VNodeProps.CHILDREN]?.forEach((c) => changes.push(...remove(c)));
    return changes;
  }

  return [];
}

export function toBeRemoved(
  vNode?: VNode<Node>,
  previousVNode?: VNode<Node>,
  parentVNode?: VNode<Node>,
) {
  return vNode == null && previousVNode && parentVNode;
}
