import {
  isVComponent,
  isVElement,
  isVFragment,
  isVText,
  type VNode,
  VNodeProps,
} from "../../../v-node/mod.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import type { UnmountComponentChangeSet } from "./types/component.ts";
import type { DeleteElementChangeSet } from "./types/element.ts";
import type { DeleteTextChangeSet } from "./types/text.ts";

export function remove(
  vNode: VNode<Node>,
  unmount: boolean = true,
): ChangeSet<unknown>[] {
  if (isVComponent(vNode)) {
    const changeSet = [
      ...remove(vNode[VNodeProps.AST], unmount),
    ];
    if (unmount) {
      changeSet.unshift(
        <UnmountComponentChangeSet> {
          [Props.Type]: Type.Component,
          [Props.Action]: Action.Unmount,
          [Props.Payload]: {
            vComponent: vNode,
          },
        },
      );
    }
    return changeSet;
  }

  if (isVFragment(vNode)) {
    const changeSets: ChangeSet<unknown>[] = [];
    vNode[VNodeProps.CHILDREN]?.forEach((c) =>
      changeSets.push(...remove(c, unmount))
    );
    return changeSets;
  }

  if (isVElement(vNode)) {
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

  if (isVText(vNode)) {
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
