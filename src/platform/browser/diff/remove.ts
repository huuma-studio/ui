import { VNode, VType } from "../../../ast.ts";
import { Action, ChangeSet, Props, Type } from "./dispatch.ts";
import { DestroyComponentChangeSet } from "./types/component.ts";

export function remove(
  vNode: VNode<Node>,
): ChangeSet<unknown>[] {
  if (vNode?.type === VType.COMPONENT) {
    return [
      <DestroyComponentChangeSet> {
        [Props.Type]: Type.Component,
        [Props.Action]: Action.Destroy,
        [Props.Payload]: {
          vNode,
        },
      },
      ...destroyComponents(vNode.ast),
    ];
  }

  if (vNode?.type === VType.ELEMENT) {
    return [{
      [Props.Type]: Type.Element,
      [Props.Action]: Action.Delete,
      [Props.Payload]: {
        vNode,
      },
    }];
  }

  if (vNode?.type === VType.TEXT) {
    return [{
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Delete,
      [Props.Payload]: {
        vNode,
      },
    }];
  }

  return [];
}

function destroyComponents(vNode: VNode<Node>): ChangeSet<unknown>[] {
  const changes: ChangeSet<unknown>[] = [];
  if (vNode?.type === VType.COMPONENT) {
    changes.push(...remove(vNode.ast));
  }
  if (vNode?.type === VType.ELEMENT) {
    vNode.children?.forEach((child) => {
      changes.push(...remove(child));
    });
  }
  return changes;
}

export function toBeRemoved(
  vNode?: VNode<Node>,
  previousVNode?: VNode<Node>,
  parentVNode?: VNode<Node>,
) {
  return vNode == null && previousVNode && parentVNode;
}
