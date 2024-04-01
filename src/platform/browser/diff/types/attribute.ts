import { VElement, VNodeRef } from "../../../../ast.ts";
import { Action, ChangeSet, Props, Type } from "../dispatch.ts";

interface BaseAttributeChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Attribute;
}

export interface CreateAttributePayload {
  vNode: VElement<Node>;
  name: string;
  value: string | boolean;
}

export interface UpdateAttributePayload {
  vNode: VElement<Node>;
  name: string;
  value: string | boolean;
}

export interface DeleteAttributePayload {
  vNode: VElement<Node>;
  name: string;
}

export interface CreateAttributeChangeSet
  extends BaseAttributeChangeSet<CreateAttributePayload> {
  [Props.Action]: Action.Create;
}

export interface UpdateAttributeChangeSet
  extends BaseAttributeChangeSet<UpdateAttributePayload> {
  [Props.Action]: Action.Update;
}

export interface DeleteAttributeChangeSet
  extends BaseAttributeChangeSet<DeleteAttributePayload> {
  [Props.Action]: Action.Delete;
}

export type AttributeChangeSet =
  | CreateAttributeChangeSet
  | UpdateAttributeChangeSet
  | DeleteAttributeChangeSet;

export function attribute(change: AttributeChangeSet) {
  switch (change[Props.Action]) {
    case Action.Create:
      return createOrUpdate(<CreateAttributePayload> change[Props.Payload]);
    case Action.Update:
      return createOrUpdate(<CreateAttributePayload> change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteAttributePayload> change[Props.Payload]);
  }
}

function createOrUpdate({ vNode, name, value }: CreateAttributePayload): void {
  if (
    name === "checked" && typeof value === "boolean"
  ) {
    (<HTMLFormElement> vNode.nodeRef)[name] = value;
  }
  if (name === "value") {
    (<HTMLFormElement> vNode.nodeRef)[name] = `${value}`;
  }
  if (name === "unsafeInnerHTML") {
    (<HTMLFormElement> vNode.nodeRef).innerHTML = `${value}`;
    return;
  }
  (<HTMLElement> vNode.nodeRef).setAttribute(
    name,
    `${value}`,
  );
}

function remove({ name, vNode }: DeleteAttributePayload): void {
  if (name === "checked") {
    (<HTMLFormElement> vNode.nodeRef)[name] = false;
  }
  if (name === "value") {
    (<HTMLFormElement> vNode.nodeRef).value = "";
  }
  (<HTMLElement> (<VNodeRef<Node>> vNode).nodeRef).removeAttribute(
    name,
  );
}

export function compareAttributes(
  vNode: VElement<Node>,
  previousVNode: VElement<Node>,
): ChangeSet<unknown>[] {
  const changes: AttributeChangeSet[] = [];
  const { ...previousProps } = previousVNode.props;

  for (const prop in vNode.props) {
    if (
      typeof vNode.props[prop] !== "string" &&
      typeof vNode.props[prop] !== "boolean"
    ) {
      continue;
    }

    // Attribute does not exist on previous vnode
    if (!previousProps[prop]) {
      changes.push(
        ...setAttribute(prop, vNode.props[prop], vNode),
      );
    }

    // Update attribute if value has changed
    if (vNode.props[prop] !== previousProps[prop]) {
      changes.push(...setAttribute(prop, vNode.props[prop], vNode));
      delete previousProps[prop];
    }

    // Remove left attributes from node
    for (const prop in previousProps) {
      if (!vNode.props[prop]) {
        changes.push({
          [Props.Action]: Action.Delete,
          [Props.Type]: Type.Attribute,
          [Props.Payload]: {
            vNode,
            name: prop,
          },
        });
      }
    }
  }

  return changes;
}

export function setAttribute(
  key: string,
  value: unknown,
  vNode: VElement<Node>,
): AttributeChangeSet[] {
  if (
    typeof value === "string" ||
    value === true
  ) {
    return [{
      [Props.Action]: Action.Create,
      [Props.Type]: Type.Attribute,
      [Props.Payload]: {
        vNode,
        name: key,
        value,
      },
    }];
  }
  if (value === false) {
    return [{
      [Props.Type]: Type.Attribute,
      [Props.Action]: Action.Delete,
      [Props.Payload]: {
        vNode,
        name: key,
      },
    }];
  }
  return [];
}
