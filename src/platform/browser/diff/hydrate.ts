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
import { toText } from "../../../utils/text.ts";
import { type AttachmentRef, AttachmentType, type ParentAttachmentRef } from "./attachment-ref.ts";

import { diff } from "./diff.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import { render } from "./render.ts";
import { setAttribute } from "./types/attribute.ts";
import type { LinkComponentChangeSet, MountComponentChangeSet } from "./types/component.ts";
import type { LinkElementChangeSet, ReplaceElementChangeSet } from "./types/element.ts";
import type { CreateEventChangeSet } from "./types/event.ts";
import type { LinkTextChangeSet, ReplaceTextChangeSet } from "./types/text.ts";

/**
 * What's left of server text nodes that hydration split for a text vNode
 * (see `text()`): only the next text vNode takes it.
 */
const remainders = new WeakSet<Node>();

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

    skipComments(nodes);

    if (isVText(vNode) && nodes.length) {
      return text(vNode, nodes, attachmentRef);
    }

    dropRemainder(nodes);
    skipComments(nodes);
    const node = nodes.shift();

    if (node && isVElement(vNode)) {
      return element(vNode, node, attachmentRef);
    }
  }

  return render(vNode, attachmentRef);
}

/**
 * Skips the comments at the start of `nodes`. Comments are never part of
 * the client tree, but island marker comments can still sit in the
 * collected node stream (e.g. with nested islands), and would otherwise
 * desync every following sibling.
 */
function skipComments(nodes: Node[]): void {
  while (nodes[0]?.nodeType === 8 /* Node.COMMENT_NODE */) {
    nodes.shift();
  }
}

function component(
  vComponent: VComponent<Node>,
  nodes: Node[],
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  return [
    <LinkComponentChangeSet>{
      [Props.Type]: Type.Component,
      [Props.Action]: Action.Link,
      [Props.Payload]: {
        vComponent,
        attachmentRef,
      },
    },
    ...hydrate(vComponent[VNodeProps.AST], nodes, attachmentRef),
    <MountComponentChangeSet>{
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
    changes.push(<ReplaceElementChangeSet>{
      [Props.Type]: Type.Element,
      [Props.Action]: Action.Replace,
      [Props.Payload]: { vElement, node, attachmentRef },
    });
    skipChildren = true;
  } else {
    changes.push(<LinkElementChangeSet>{
      [Props.Type]: Type.Element,
      [Props.Action]: Action.Link,
      [Props.Payload]: { vElement, node, attachmentRef },
    });
  }

  // Attach events to the dom node
  vElement[VNodeProps.EVENT_REFS]?.forEach((eventRef) => {
    changes.push(<CreateEventChangeSet>{
      [Props.Type]: Type.Event,
      [Props.Action]: Action.Create,
      [Props.Payload]: { vNode: vElement, ...eventRef },
    });
  });

  for (const prop in vElement[VNodeProps.PROPS]) {
    if (prop === "children") continue;
    changes.push(...setAttribute(prop, vElement[VNodeProps.PROPS][prop], vElement));
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
  if (nodes) dropRemainder(nodes);

  return changes;
}

/**
 * Hydrates `vText` with the first of `nodes`. The browser parses text that
 * the server wrote next to other text as one text node, and empty text as
 * no node at all (spec #132). So a text node that starts with the text is
 * split, its remainder left for the next text vNode, and empty text before
 * another node gets a new text node, so the next vNode keeps its node.
 */
function text(
  vText: VText<Node>,
  nodes: Node[],
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  const text = toText(vText[VNodeProps.TEXT]);
  const next = nodes[0];
  let node: Node;
  let matches = true;

  if (next instanceof Text && next.data.startsWith(text)) {
    node = nodes.shift()!;
    if (next.data.length > text.length) {
      const remainder = next.splitText(text.length);
      remainders.add(remainder);
      nodes.unshift(remainder);
    }
  } else if (text === "" && next.parentNode) {
    node = next.parentNode.insertBefore(new Text(""), next);
  } else {
    // The server rendered something else here.
    node = nodes.shift()!;
    matches = false;
  }

  if (matches && !isVSignal(vText[VNodeProps.TEXT])) {
    return [
      <LinkTextChangeSet>{
        [Props.Type]: Type.Text,
        [Props.Action]: Action.Link,
        [Props.Payload]: { vText, node, attachmentRef },
      },
    ];
  }

  // Binds the node in place: to the text's signal, or to text that differs.
  vText[VNodeProps.NODE_REF] = node;
  return [
    <ReplaceTextChangeSet>{
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Replace,
      [Props.Payload]: { vText, attachmentRef },
    },
  ];
}

/**
 * Removes the remainder of a split text node from the DOM, if it's the
 * first of `nodes`: no text vNode took it, as the server rendered other
 * text than the browser.
 */
export function dropRemainder(nodes: Node[]): void {
  if (!nodes[0] || !remainders.has(nodes[0])) return;
  const remainder = nodes.shift()!;
  remainder.parentNode?.removeChild(remainder);
}
