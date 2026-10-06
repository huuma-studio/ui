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

    const node = peekNode(nodes);

    if (node) {
      if (isVElement(vNode)) {
        nodes.shift();
        return element(vNode, node, attachmentRef);
      }

      /*
       * A text vNode must only bind to a DOM text node. The HTML parser
       * drops empty text nodes (e.g. a "" child from a falsy guard like
       * `{error && <p/>}`), so the next node can be the following
       * sibling element. Leave it for that sibling and render the text
       * instead of hijacking its DOM node - otherwise every following
       * sibling (e.g. further lists in the island) hydrates the previous
       * sibling's DOM.
       */
      if (isVText(vNode) && node.nodeType === 3 /* Node.TEXT_NODE */) {
        nodes.shift();
        return text(vNode, node, attachmentRef);
      }
    }
  }

  return render(vNode, attachmentRef);
}

/*
 * Hydration consumes the server-rendered nodes as one sequential stream:
 * one DOM node per client vNode child, in order. Anything in the stream
 * that the client tree does not model desyncs it, mixing up every
 * following sibling (e.g. a second list hydrating into the first list's
 * DOM):
 *
 * - The HTML parser drops empty text nodes (handled at the text branch
 *   above).
 * - Island marker comments were already stripped from the DOM but can
 *   still sit in the collected node stream (e.g. with nested islands).
 *
 * Comments are never part of the client tree, so skip them.
 */
function peekNode(nodes: Node[]): Node | undefined {
  while (nodes.length && nodes[0]?.nodeType === 8 /* Node.COMMENT_NODE */) {
    nodes.shift();
  }
  return nodes[0];
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
