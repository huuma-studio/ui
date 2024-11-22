import {
  type VComponent,
  type VElement,
  type VFragment,
  type VNode,
  VNodeProps,
  type VText,
  VType,
} from "../../../v-node/mod.ts";
import { diff } from "./diff.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import { setAttribute } from "./types/attribute.ts";
import type { MountComponentChangeSet } from "./types/component.ts";
import type { EventChangeSet } from "./types/event.ts";

export function hydrate(vNode: VNode<Node>, node: Node): ChangeSet<unknown>[] {
  if (vNode?.type === VType.COMPONENT) {
    return component(vNode, node);
  }
  if (vNode?.type === VType.ELEMENT) {
    return element(vNode, node);
  }
  if (vNode?.type === VType.TEXT) {
    return text(vNode, node);
  }
  if (vNode?.type === VType.FRAGMENT) {
    return fragment(vNode, node);
  }
  return [];
}

function component(vNode: VComponent<Node>, node: Node): ChangeSet<unknown>[] {
  return [
    <MountComponentChangeSet>{
      [Props.Type]: Type.Component,
      [Props.Action]: Action.Mount,
      [Props.Payload]: {
        vNode,
      },
    },
    ...hydrate(vNode[VNodeProps.AST], node),
  ];
}

function element(vNode: VElement<Node>, node: Node) {
  const changes: ChangeSet<unknown>[] = [];

  // Replace dom node with effective vnode type
  if (node.nodeName.toLowerCase() !== vNode[VNodeProps.TAG]) {
    changes.push({
      [Props.Type]: Type.Element,
      [Props.Action]: Action.Replace,
      [Props.Payload]: { vNode, node: node },
    });
  } else {
    // Link current dom node with the vnode
    vNode[VNodeProps.NODE_REF] = node;
  }

  // Attach events to the dom node
  vNode[VNodeProps.EVENT_REFS]?.forEach((eventRef) => {
    changes.push(<EventChangeSet>{
      [Props.Type]: Type.Event,
      [Props.Action]: Action.Create,
      [Props.Payload]: { vNode: vNode, ...eventRef },
    });
  });

  for (const prop in vNode[VNodeProps.PROPS]) {
    changes.push(...setAttribute(prop, vNode[VNodeProps.PROPS][prop], vNode));
  }

  //TODO: Check if we need to filter out empty nodes here?
  const children = vNode[VNodeProps.CHILDREN]?.filter((c) => c != null);
  children?.forEach((child, index) => {
    changes.push(
      ...diff({
        node: vNode[VNodeProps.NODE_REF]?.childNodes.item(index),
        vNode: child,
        parentVNode: vNode,
      }),
    );
  });

  return changes;
}

/*
 * Hydrate "VText"
 */
function text(vText: VText<Node>, node: Node) {
  const changes: ChangeSet<unknown>[] = [];
  vText[VNodeProps.NODE_REF] = node;

  if (!(node instanceof Text) || node.textContent !== vText[VNodeProps.TEXT]) {
    changes.push({
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Replace,
      [Props.Payload]: {
        vNode: vText,
      },
    });
  }

  return changes;
}

function fragment(vFragement: VFragment<Node>, node: Node) {
  return [];
}

export function toBeHydrated<T>(
  vNode: VNode<T>,
  previousVNode: VNode<T>,
  node?: T | null,
): boolean {
  return !!(node && vNode && !previousVNode);
}
