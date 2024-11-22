import {
  type VComponent,
  type VElement,
  type VNode,
  VNodeProps,
  type VState,
  type VText,
  VType,
} from "../../../v-node/mod.ts";
import { diff } from "./diff.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import { remove } from "./remove.ts";
import { compareAttributes } from "./types/attribute.ts";
import type { ElementChangeSet } from "./types/element.ts";
import type { EventChangeSet } from "./types/event.ts";
import type { UpdateTextPayload } from "./types/text.ts";

export function update(
  vNode: VNode<Node>,
  previousVNode: VNode<Node>,
): ChangeSet<unknown>[] {
  if (vNode == null || previousVNode == null) {
    console.log("VNode could not be updated", vNode, previousVNode);
    return [];
  }

  if (
    vNode.type === VType.COMPONENT &&
    previousVNode.type === VType.COMPONENT
  ) {
    return updateComponent(vNode, previousVNode);
  }

  if (vNode.type === VType.ELEMENT && previousVNode.type === VType.ELEMENT) {
    return updateElement(vNode, previousVNode);
  }

  if (vNode.type === VType.ELEMENT && previousVNode.type === VType.TEXT) {
    return replaceTextWithElement(vNode, previousVNode);
  }

  if (vNode.type === VType.TEXT && previousVNode.type === VType.TEXT) {
    return updateText(vNode, previousVNode);
  }

  if (vNode.type === VType.TEXT && previousVNode.type === VType.ELEMENT) {
    return replaceElementWithText(vNode, previousVNode);
  }

  return [];
}

function updateComponent(
  vNode: VComponent<Node>,
  previousVNode: VComponent<Node>,
) {
  // Same kind of component
  if (vNode[VNodeProps.FN] === previousVNode[VNodeProps.FN]) {
    return update(vNode[VNodeProps.AST], previousVNode[VNodeProps.AST]);
  }

  // Other component destroy old and render new
  return [...remove(previousVNode)];
}

function updateElement(
  vNode: VElement<Node>,
  previousVNode: VElement<Node>,
): ChangeSet<unknown>[] {
  const changes: ChangeSet<unknown>[] = [];
  let skipPrevious = false;

  // Tag did change
  if (
    vNode[VNodeProps.TAG] !== (<VElement<Node>>previousVNode)[VNodeProps.TAG]
  ) {
    changes.push(<ElementChangeSet>{
      [Props.Type]: Type.Element,
      [Props.Action]: Action.Replace,
      [Props.Payload]: {
        node: previousVNode[VNodeProps.NODE_REF],
        vNode,
      },
    });
    skipPrevious = true;
  } else {
    vNode[VNodeProps.NODE_REF] = previousVNode[VNodeProps.NODE_REF];
  }

  // Update event listener
  changes.push(...updateEvents(vNode, previousVNode));

  // Update attributes
  changes.push(...compareAttributes(vNode, previousVNode));

  // Update children
  changes.push(
    ...updateChildren({
      vNode,
      previousVNode: skipPrevious ? undefined : previousVNode,
    }),
  );

  return changes;
}

function replaceTextWithElement(
  vNode: VElement<Node>,
  previousVNode: VText<Node>,
) {
  const changes: ChangeSet<unknown>[] = [];

  vNode[VNodeProps.NODE_REF] = previousVNode[VNodeProps.NODE_REF];

  changes.push({
    [Props.Type]: Type.Element,
    [Props.Action]: Action.Replace,
    [Props.Payload]: {
      node: previousVNode[VNodeProps.NODE_REF],
      vNode,
    },
  });

  // Add events
  changes.push(...updateEvents(vNode));

  // Add attributes
  for (const prop in vNode[VNodeProps.PROPS]) {
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
    ?.forEach((child) => {
      changes.push(...diff({ parentVNode: vNode, vNode: child }));
    });

  return changes;
}

function updateText(
  vNode: VText<Node>,
  previousVNode: VText<Node>,
): ChangeSet<unknown>[] {
  vNode[VNodeProps.NODE_REF] = previousVNode[VNodeProps.NODE_REF];
  const text = isState(vNode)
    ? (<VState>vNode[VNodeProps.TEXT]).get
    : vNode[VNodeProps.TEXT];
  const previousText = isState(previousVNode)
    ? (<VState>previousVNode[VNodeProps.TEXT]).get
    : previousVNode[VNodeProps.TEXT];

  if (text !== previousText) {
    if (vNode[VNodeProps.NODE_REF] instanceof Text) {
      return [updateTextContent(vNode)];
    }
  }
  return [];
}

function replaceElementWithText(
  vNode: VText<Node>,
  previousVNode: VElement<Node>,
): ChangeSet<unknown>[] {
  vNode[VNodeProps.NODE_REF] = previousVNode[VNodeProps.NODE_REF];
  return [
    {
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Replace,
      [Props.Payload]: {
        vNode,
      },
    },
  ];
}

export function updateEvents(
  vNode: VElement<Node>,
  previousvNode?: VElement<Node>,
): ChangeSet<unknown>[] {
  const changes: EventChangeSet[] = [];

  // Remove previous events
  previousvNode?.[VNodeProps.EVENT_REFS]?.forEach((eventRef) => {
    changes.push({
      [Props.Type]: Type.Event,
      [Props.Action]: Action.Delete,
      [Props.Payload]: {
        vNode: previousvNode,
        ...eventRef,
      },
    });
  });

  // Attach new events
  vNode?.[VNodeProps.EVENT_REFS]?.forEach((eventRef) => {
    changes.push({
      [Props.Type]: Type.Event,
      [Props.Action]: Action.Create,
      [Props.Payload]: {
        vNode,
        ...eventRef,
      },
    });
  });

  return changes;
}

// TODO: Inline function
function updateTextContent(vNode: VText<Node>): ChangeSet<UpdateTextPayload> {
  return {
    [Props.Type]: Type.Text,
    [Props.Action]: Action.Update,
    [Props.Payload]: {
      vNode,
    },
  };
}

interface UpdateChildrenProps {
  vNode: VElement<Node> | VText<Node>;
  previousVNode?: VElement<Node> | VText<Node>;
}

export function updateChildren(
  props: UpdateChildrenProps,
): ChangeSet<unknown>[] {
  const changes: ChangeSet<unknown>[] = [];
  const previousChildren: VNode<Node>[] =
    props.previousVNode && VNodeProps.CHILDREN in props.previousVNode
      ? props.previousVNode[VNodeProps.CHILDREN] || []
      : [];

  if (props.vNode && VNodeProps.CHILDREN in props.vNode) {
    props.vNode?.[VNodeProps.CHILDREN]?.forEach((child) => {
      changes.push(
        ...diff({
          parentVNode: props.vNode,
          vNode: child,
          previousVNode: previousChildren?.shift(),
        }),
      );
    });
  }

  previousChildren.forEach((previousChild) => {
    changes.push(
      ...diff({ parentVNode: props.vNode, previousVNode: previousChild }),
    );
  });

  return changes;
}

export function toBeUpdated(
  vNode?: VNode<Node>,
  previousVNode?: VNode<Node>,
): boolean {
  if (vNode && previousVNode) {
    return true;
  }
  return false;
}

export function isState(vNode: VText<Node>) {
  return (
    !!vNode &&
    typeof vNode[VNodeProps.TEXT] === "object" &&
    "get" in vNode[VNodeProps.TEXT]
  );
}
