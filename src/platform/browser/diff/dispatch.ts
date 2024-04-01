import { attribute, AttributeChangeSet } from "./types/attribute.ts";
import { component, ComponentChangeSet } from "./types/component.ts";
import { element, ElementChangeSet } from "./types/element.ts";
import { event, EventChangeSet } from "./types/event.ts";
import { text, TextChangeSet } from "./types/text.ts";

export enum Type {
  Component,
  Element,
  Event,
  Attribute,
  Text,
}

export enum Action {
  Create,
  Link,
  Attach,
  Mount,
  Update,
  Replace,
  Destroy,
  Delete,
}

export enum Props {
  Type,
  Action,
  Payload,
}

export interface ChangeSet<T> {
  [Props.Type]: Type;
  [Props.Action]: Action;
  [Props.Payload]: T;
}

function change(changeSet: ChangeSet<unknown>) {
  switch (changeSet[Props.Type]) {
    case Type.Attribute:
      return attribute(<AttributeChangeSet> changeSet);
    case Type.Event:
      return event(<EventChangeSet> changeSet);
    case Type.Component:
      return component(<ComponentChangeSet> changeSet);
    case Type.Element:
      return element(<ElementChangeSet> changeSet);
    case Type.Text:
      return text(<TextChangeSet> changeSet);
  }
}

export function dispatch(changes: ChangeSet<unknown>[]) {
  while (changes.length) {
    const changeSet = changes.shift();
    if (changeSet) change(changeSet);
  }
}
