import {
  type VComponent,
  type VElement,
  type VFragment,
  type VNode,
  VNodeProps,
  type VSignal,
  type VText,
  VType,
} from "../../../v-node/mod.ts";
import { type AttachmentRef, AttachmentType } from "./attachment-ref.ts";
import { diff } from "./diff.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import { compareAttributes } from "./types/attribute.ts";
import type { LinkComponentChangeSet } from "./types/component.ts";
import type { LinkElementChangeSet } from "./types/element.ts";
import type { EventChangeSet } from "./types/event.ts";
import type { LinkTextChangeSet, UpdateTextChangeSet } from "./types/text.ts";

export function update(
  vNode: VNode<Node>,
  previousVNode: VNode<Node>,
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  if (vNode == null || previousVNode == null) {
    return [];
  }

  if (vNode && previousVNode == null) {
    return diff({ vNode, attachmentRef });
  }

  if (vNode.type === VType.TEXT && previousVNode.type === VType.TEXT) {
    return updateText(vNode, previousVNode, attachmentRef);
  }

  if (
    vNode.type === VType.ELEMENT && previousVNode.type === VType.ELEMENT &&
    vNode[VNodeProps.TAG] === previousVNode[VNodeProps.TAG]
  ) {
    return updateElement(vNode, previousVNode, attachmentRef);
  }

  if (
    vNode.type === VType.COMPONENT &&
    previousVNode.type === VType.COMPONENT &&
    vNode[VNodeProps.FN] === previousVNode[VNodeProps.FN]
  ) {
    return updateComponent(vNode, previousVNode, attachmentRef);
  }

  if (vNode.type === VType.FRAGMENT && previousVNode.type === VType.FRAGMENT) {
    return updateFragment(vNode, previousVNode, attachmentRef);
  }

  return [...diff({ previousVNode }), ...diff({ vNode, attachmentRef })];
}

function updateComponent(
  vComponent: VComponent<Node>,
  previousVComponent: VComponent<Node>,
  attachmentRef: AttachmentRef,
) {
  return [
    <LinkComponentChangeSet> {
      [Props.Type]: Type.Component,
      [Props.Action]: Action.Link,
      [Props.Payload]: {
        vComponent,
        attachmentRef,
      },
    },
    ...update(
      vComponent[VNodeProps.AST],
      previousVComponent[VNodeProps.AST],
      attachmentRef,
    ),
  ];
}

function updateFragment(
  vFragement: VFragment<Node>,
  previousVFragment: VFragment<Node>,
  attachmentRef: AttachmentRef,
) {
  const previousVNodes = [
    ...(previousVFragment[VNodeProps.CHILDREN] ?? []),
  ];
  const changeSet: ChangeSet<unknown>[] = [];

  for (const vNode of vFragement[VNodeProps.CHILDREN] ?? []) {
    changeSet.push(...update(vNode, previousVNodes.shift(), attachmentRef));
  }

  for (const previousVNode of previousVNodes) {
    changeSet.push(...diff({ previousVNode }));
  }

  return changeSet;
}

function updateElement(
  vElement: VElement<Node>,
  previousVElement: VElement<Node>,
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  const changeSet: ChangeSet<unknown>[] = [];

  changeSet.push(
    <LinkElementChangeSet> {
      [Props.Type]: Type.Element,
      [Props.Action]: Action.Link,
      [Props.Payload]: {
        vElement,
        node: previousVElement[VNodeProps.NODE_REF],
        attachmentRef,
      },
    },
    ...updateEvents(vElement, previousVElement),
    ...compareAttributes(vElement, previousVElement),
    ...updateChildren(
      vElement,
      previousVElement,
      { type: AttachmentType.Parent, vNode: vElement },
    ),
  );

  return changeSet;
}

function updateText(
  vText: VText<Node>,
  previousVNode: VText<Node>,
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  const changeSets: ChangeSet<unknown>[] = [];

  changeSets.push(
    <LinkTextChangeSet> {
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Link,
      [Props.Payload]: {
        vText,
        node: previousVNode[VNodeProps.NODE_REF],
        attachmentRef,
      },
    },
  );

  const text = isSignal(vText)
    ? (<VSignal> vText[VNodeProps.TEXT]).get()
    : vText[VNodeProps.TEXT];
  const previousText = isSignal(previousVNode)
    ? (<VSignal> previousVNode[VNodeProps.TEXT]).get()
    : previousVNode[VNodeProps.TEXT];

  if (text !== previousText) {
    changeSets.push(
      <UpdateTextChangeSet> {
        [Props.Type]: Type.Text,
        [Props.Action]: Action.Update,
        [Props.Payload]: {
          vText,
        },
      },
    );
  }
  return changeSets;
}

export function updateEvents(
  vElement: VElement<Node>,
  previousVElement?: VElement<Node>,
): ChangeSet<unknown>[] {
  const changes: EventChangeSet[] = [];

  previousVElement?.[VNodeProps.EVENT_REFS]?.forEach((eventRef) => {
    changes.push({
      [Props.Type]: Type.Event,
      [Props.Action]: Action.Delete,
      [Props.Payload]: {
        vNode: previousVElement,
        ...eventRef,
      },
    });
  });

  vElement?.[VNodeProps.EVENT_REFS]?.forEach((eventRef) => {
    changes.push({
      [Props.Type]: Type.Event,
      [Props.Action]: Action.Create,
      [Props.Payload]: {
        vNode: vElement,
        ...eventRef,
      },
    });
  });

  return changes;
}

export function updateChildren(
  vNode: VElement<Node> | VFragment<Node>,
  previousVNode: VElement<Node> | VFragment<Node>,
  attachmentRef: AttachmentRef,
): ChangeSet<unknown>[] {
  const changeSet: ChangeSet<unknown>[] = [];

  const previousVChildren: VNode<Node>[] = [
    ...(previousVNode[VNodeProps.CHILDREN] ?? []),
  ];

  vNode[VNodeProps.CHILDREN]?.forEach((vChild) => {
    const previousVChild = previousVChildren.shift();

    changeSet.push(
      ...diff({
        vNode: vChild,
        previousVNode: previousVChild,
        attachmentRef,
      }),
    );
  });

  previousVChildren.forEach((previousVChild) => {
    changeSet.push(...diff({ previousVNode: previousVChild }));
  });

  return changeSet;
}

export function isSignal(vNode: VText<Node>) {
  return (
    !!vNode &&
    typeof vNode[VNodeProps.TEXT] === "object" &&
    "get" in vNode[VNodeProps.TEXT]
  );
}
