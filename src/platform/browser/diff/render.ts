import {
  type VComponent,
  type VElement,
  type VFragment,
  type VNode,
  VNodeProps,
  type VText,
  VType,
} from "../../../v-node/mod.ts";
import { type AttachmentRef, AttachmentType } from "./attachment-ref.ts";
import { Action, type ChangeSet, Props, Type } from "./dispatch.ts";
import type { CreateAttributeChangeSet } from "./types/attribute.ts";
import type {
  LinkComponentChangeSet,
  MountComponentChangeSet,
} from "./types/component.ts";
import type {
  AttachElementChangeSet,
  CreateElementChangeSet,
} from "./types/element.ts";
import type { CreateEventChangeSet } from "./types/event.ts";
import type { TextChangeSet } from "./types/text.ts";

export function render(
  vNode: VNode<Node>,
  attachmentRef: AttachmentRef,
  mount: boolean,
): ChangeSet<unknown>[] {
  if (!vNode) {
    return [];
  }

  if (vNode.type === VType.COMPONENT) {
    return component(vNode, attachmentRef, mount);
  }

  if (vNode.type === VType.ELEMENT) {
    return element(vNode, attachmentRef, mount);
  }

  if (vNode.type === VType.TEXT) {
    return text(vNode, attachmentRef);
  }

  if (vNode.type === VType.FRAGMENT) {
    return fragment(vNode, attachmentRef, mount);
  }

  return [];
}

function component(
  vComponent: VComponent<Node>,
  attachmentRef: AttachmentRef,
  mount: boolean,
) {
  const changeSet: ChangeSet<unknown>[] = [
    <LinkComponentChangeSet> {
      [Props.Type]: Type.Component,
      [Props.Action]: Action.Link,
      [Props.Payload]: {
        vComponent,
        attachmentRef,
      },
    },
  ];
  if (mount) {
    changeSet.push(
      <MountComponentChangeSet> {
        [Props.Type]: Type.Component,
        [Props.Action]: Action.Mount,
        [Props.Payload]: {
          vComponent,
        },
      },
    );
  }
  changeSet.push(...render(vComponent[VNodeProps.AST], attachmentRef, mount));
  return changeSet;
}

function element(
  vElement: VElement<Node>,
  attachmentRef: AttachmentRef,
  mount: boolean,
): ChangeSet<unknown>[] {
  const changeSets: ChangeSet<unknown>[] = [];

  changeSets.push(
    <CreateElementChangeSet> {
      [Props.Type]: Type.Element,
      [Props.Action]: Action.Create,
      [Props.Payload]: {
        vElement,
        attachmentRef,
      },
    },
    <AttachElementChangeSet> {
      [Props.Type]: Type.Element,
      [Props.Action]: Action.Attach,
      [Props.Payload]: {
        vElement,
        attachmentRef,
      },
    },
  );

  // Attach events
  vElement[VNodeProps.EVENT_REFS].forEach((event) => {
    changeSets.push(
      <CreateEventChangeSet> {
        [Props.Type]: Type.Event,
        [Props.Action]: Action.Create,
        [Props.Payload]: {
          vNode: vElement,
          name: event.name,
          listener: event.listener,
        },
      },
    );
  });

  // Add attributes
  for (const prop in vElement[VNodeProps.PROPS]) {
    if (prop === "children") continue;
    changeSets.push(
      <CreateAttributeChangeSet> {
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Create,
        [Props.Payload]: {
          vNode: vElement,
          name: prop,
          value: <string> vElement[VNodeProps.PROPS][prop],
        },
      },
    );
  }

  vElement[VNodeProps.CHILDREN]?.forEach((child) => {
    changeSets.push(
      ...render(child, { type: AttachmentType.Parent, vNode: vElement }, mount),
    );
  });

  return changeSets;
}

function text(
  vText: VText<Node>,
  attachmentRef: AttachmentRef,
): TextChangeSet[] {
  return [
    {
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Create,
      [Props.Payload]: {
        vText: vText,
      },
    },
    {
      [Props.Type]: Type.Text,
      [Props.Action]: Action.Attach,
      [Props.Payload]: {
        vText,
        attachmentRef,
      },
    },
  ];
}

function fragment(
  vFragement: VFragment<Node>,
  attachmentRef: AttachmentRef,
  mount: boolean,
) {
  const changes: ChangeSet<unknown>[] = [];
  vFragement[VNodeProps.CHILDREN]?.forEach((vNode) => {
    changes.push(...render(vNode, attachmentRef, mount));
  });
  return changes;
}
