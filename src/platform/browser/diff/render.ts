import {
  type VElement,
  type VNode,
  type VText,
  VType,
  VNodeProps,
  type VFragment,
} from "../../../v-node/mod.ts";
import { diff } from "./diff.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import type { TextChangeSet } from "./types/text.ts";

interface RenderProps {
  parentVNode: VNode<Node>;
  vNode: VNode<Node>;
}

export function render(props: RenderProps): ChangeSet<unknown>[] {
  if (!props.vNode) {
    return [];
  }

  if (props.vNode.type === VType.COMPONENT) {
    return render({
      parentVNode: props.parentVNode,
      vNode: props.vNode[VNodeProps.AST],
    });
  }

  if (props.vNode.type === VType.ELEMENT) {
    return element(props.parentVNode, props.vNode);
  }

  if (props.vNode.type === VType.TEXT) {
    return text(props.parentVNode, props.vNode);
  }

  if (props.vNode.type === VType.FRAGMENT) {
    return fragment(props.parentVNode, props.vNode);
  }

  return [];
}

function element(
  parentVNode: VNode<Node>,
  vNode: VElement<Node>,
): ChangeSet<unknown>[] {
  const changes: ChangeSet<unknown>[] = [];

  // Create DOM node and link it to the vNode
  changes.push({
    [Props.Type]: Type.Element,
    [Props.Action]: Action.Create,
    [Props.Payload]: {
      parentVNode,
      vNode,
    },
  });

  // Attach the nodeRef to the DOM
  changes.push({
    [Props.Type]: Type.Element,
    [Props.Action]: Action.Attach,
    [Props.Payload]: {
      parentVNode,
      vNode,
    },
  });

  changes.push({
    [Props.Type]: Type.Element,
    [Props.Action]: Action.Mount,
    [Props.Payload]: {
      vNode,
    },
  });

  // Attach events
  vNode[VNodeProps.EVENT_REFS].forEach((event) => {
    changes.push({
      [Props.Type]: Type.Event,
      [Props.Action]: Action.Create,
      [Props.Payload]: {
        vNode,
        name: event.name,
        listener: event.listener,
      },
    });
  });

  // Add attributes
  for (const prop in vNode[VNodeProps.EVENT_REFS]) {
    changes.push({
      [Props.Type]: Type.Attribute,
      [Props.Action]: Action.Create,
      [Props.Payload]: {
        vNode,
        name: prop,
        value: <string>vNode[VNodeProps.PROPS][prop],
      },
    });
  }

  vNode[VNodeProps.CHILDREN]
    ?.filter((c) => c != null)
    .forEach((child) => {
      changes.push(...diff({ parentVNode: vNode, vNode: child }));
    });

  return changes;
}

function text(parentVNode: VNode<Node>, vNode: VText<Node>): TextChangeSet[] {
  return [
    {
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Create,
      [Props.Payload]: {
        vNode: vNode,
      },
    },
    {
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Attach,
      [Props.Payload]: {
        parentVNode,
        vNode,
      },
    },
  ];
}

function fragment(parentVNode: VNode<Node>, vNode: VFragment<Node>) {
  const changes: ChangeSet<unknown>[] = [];
  vNode[VNodeProps.CHILDREN]
    ?.filter((c) => c != null)
    .forEach((child) => {
      changes.push(...diff({ parentVNode, vNode: child }));
    });
  return changes;
}

export function toBeRendered(props: RenderProps) {
  return props.parentVNode && props.vNode;
}
