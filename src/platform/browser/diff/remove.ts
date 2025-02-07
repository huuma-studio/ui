import { type VNode, VNodeProps, VType } from "../../../v-node/mod.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import type { UnmountComponentChangeSet } from "./types/component.ts";
import type { DeleteElementChangeSet } from "./types/element.ts";
import type { DeleteTextChangeSet } from "./types/text.ts";

export function remove(vNode: VNode<Node>): ChangeSet<unknown>[] {
  if (vNode?.type === VType.COMPONENT) {
    return [
      <UnmountComponentChangeSet> {
        [Props.Type]: Type.Component,
        [Props.Action]: Action.Unmount,
        [Props.Payload]: {
          vComponent: vNode,
        },
      },
      ...remove(vNode[VNodeProps.AST]),
    ];
  }

  if (vNode?.type === VType.FRAGMENT) {
    const changeSets: ChangeSet<unknown>[] = [];
    vNode[VNodeProps.CHILDREN]?.forEach((c) => changeSets.push(...remove(c)));
    return changeSets;
  }

  if (vNode?.type === VType.ELEMENT) {
    return [
      <DeleteElementChangeSet> {
        [Props.Type]: Type.Element,
        [Props.Action]: Action.Delete,
        [Props.Payload]: {
          vElement: vNode,
        },
      },
    ];
  }

  if (vNode?.type === VType.TEXT) {
    return [
      <DeleteTextChangeSet> {
        [Props.Type]: Type.Text,
        [Props.Action]: Action.Delete,
        [Props.Payload]: {
          vText: vNode,
        },
      },
    ];
  }

  return [];
}
