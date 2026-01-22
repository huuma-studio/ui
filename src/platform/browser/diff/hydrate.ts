import {
  isVComponent,
  isVElement,
  isVFragment,
  isVSignal,
  isVText,
  type VComponent,
  type VElement,
  type VFragment,
  type VNode,
  VNodeProps,
  type VText,
} from "../../../v-node/mod.ts";
import {
  type AttachmentRef,
  AttachmentType,
  type ParentAttachmentRef,
} from "./attachment-ref.ts";

import { diff } from "./diff.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import { render } from "./render.ts";
import { setAttribute } from "./types/attribute.ts";
import type {
  LinkComponentChangeSet,
  MountComponentChangeSet,
} from "./types/component.ts";
import type {
  LinkElementChangeSet,
  ReplaceElementChangeSet,
} from "./types/element.ts";
import type { CreateEventChangeSet } from "./types/event.ts";
import type { LinkTextChangeSet, ReplaceTextChangeSet } from "./types/text.ts";

export function hydrate(
  vNode: VNode<Node>,
  nodes: Node[],
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  if (vNode == null) {
    return [];
  }

  if (nodes.length) {
    if (isVComponent(vNode)) {
      return component(vNode, nodes, attachmentRef);
    }

    if (isVFragment(vNode)) {
      return fragment(vNode, nodes, attachmentRef);
    }

    const node = nodes.shift();

    if (node) {
      if (isVElement(vNode)) {
        return element(vNode, node, attachmentRef);
      }

      if (isVText(vNode)) {
        return text(vNode, node, attachmentRef);
      }
    }
  }

  return render(vNode, attachmentRef);
}

function component(
  vComponent: VComponent<Node>,
  nodes: Node[],
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  return [
    <LinkComponentChangeSet> {
      [Props.Type]: Type.Component,
      [Props.Action]: Action.Link,
      [Props.Payload]: {
        vComponent,
        attachmentRef,
      },
    },
    ...hydrate(vComponent[VNodeProps.AST], nodes, attachmentRef),
    <MountComponentChangeSet> {
      [Props.Type]: Type.Component,
      [Props.Action]: Action.Mount,
      [Props.Payload]: {
        vComponent,
      },
    },
  ];
}

function fragment(
  vFragement: VFragment<Node>,
  nodes: Node[],
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  const changeSet: ChangeSet<unknown>[] = [];

  for (const vNode of vFragement[VNodeProps.CHILDREN] ?? []) {
    const c = hydrate(vNode, nodes, attachmentRef);
    changeSet.push(...c);
  }
  return changeSet;
}

function element(
  vElement: VElement<Node>,
  node: Node,
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  const changes: ChangeSet<unknown>[] = [];
  let skipChildren = false;

  // Replace dom node with effective vnode type
  if (node.nodeName.toLowerCase() !== vElement[VNodeProps.TAG].toLowerCase()) {
    changes.push(
      <ReplaceElementChangeSet> {
        [Props.Type]: Type.Element,
        [Props.Action]: Action.Replace,
        [Props.Payload]: { vElement, node, attachmentRef },
      },
    );
    skipChildren = true;
  } else {
    changes.push(
      <LinkElementChangeSet> {
        [Props.Type]: Type.Element,
        [Props.Action]: Action.Link,
        [Props.Payload]: { vElement, node, attachmentRef },
      },
    );
  }

  // Attach events to the dom node
  vElement[VNodeProps.EVENT_REFS]?.forEach((eventRef) => {
    changes.push(
      <CreateEventChangeSet> {
        [Props.Type]: Type.Event,
        [Props.Action]: Action.Create,
        [Props.Payload]: { vNode: vElement, ...eventRef },
      },
    );
  });

  for (const prop in vElement[VNodeProps.PROPS]) {
    if (prop === "children") continue;
    changes.push(
      ...setAttribute(prop, vElement[VNodeProps.PROPS][prop], vElement),
    );
  }

  const nodes = skipChildren ? undefined : [...node.childNodes];

  const childrenAttachmentRef: ParentAttachmentRef = {
    type: AttachmentType.Parent,
    vNode: vElement,
  };

  vElement[VNodeProps.CHILDREN]?.forEach((vNode) => {
    changes.push(
      ...diff({
        nodes,
        vNode,
        attachmentRef: childrenAttachmentRef,
      }),
    );
  });

  return changes;
}

function text(
  vText: VText<Node>,
  node: Node,
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  const changeSet: ChangeSet<unknown>[] = [];
  const text = vText[VNodeProps.TEXT];

  if (
    node instanceof Text &&
    (node.textContent === text ||
      (isVSignal(text) && node.textContent === text.get()))
  ) {
    changeSet.push(
      <LinkTextChangeSet> {
        [Props.Type]: Type.Text,
        [Props.Action]: Action.Link,
        [Props.Payload]: {
          vText,
          node: node,
          attachmentRef,
        },
      },
    );
  } else {
    // Attach node without moving the
    vText[VNodeProps.NODE_REF] = node;
    changeSet.push(
      <ReplaceTextChangeSet> {
        [Props.Type]: Type.Text,
        [Props.Action]: Action.Replace,
        [Props.Payload]: {
          vText,
          attachmentRef,
        },
      },
    );
  }

  return changeSet;
}
