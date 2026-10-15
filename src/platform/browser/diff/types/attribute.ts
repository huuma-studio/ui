import { type HasVNodeRef, type VElement, VNodeProps } from "../../../../v-node/mod.ts";
import { BOOLEAN_ATTRIBUTES } from "../../../../jsx-runtime/boolean-attributes.ts";
import { attributeValue, isValidAttributeName } from "../../../../jsx-runtime/attributes.ts";
import { Action, type ChangeSet, Props, Type } from "../dispatch.ts";

interface BaseAttributeChangeSet<T> extends ChangeSet<T> {
  [Props.Type]: Type.Attribute;
}

export interface CreateAttributePayload {
  vNode: VElement<Node>;
  name: string;
  value: string | number | boolean | { __html: string };
}

export interface UpdateAttributePayload {
  vNode: VElement<Node>;
  name: string;
  value: string | number | boolean | { __html: string };
}

export interface DeleteAttributePayload {
  vNode: VElement<Node>;
  name: string;
}

export interface CreateAttributeChangeSet extends BaseAttributeChangeSet<CreateAttributePayload> {
  [Props.Action]: Action.Create;
}

export interface UpdateAttributeChangeSet extends BaseAttributeChangeSet<UpdateAttributePayload> {
  [Props.Action]: Action.Update;
}

export interface DeleteAttributeChangeSet extends BaseAttributeChangeSet<DeleteAttributePayload> {
  [Props.Action]: Action.Delete;
}

export type AttributeChangeSet =
  | CreateAttributeChangeSet
  | UpdateAttributeChangeSet
  | DeleteAttributeChangeSet;

export function attribute(change: AttributeChangeSet): void {
  switch (change[Props.Action]) {
    case Action.Create:
      return createOrUpdate(<CreateAttributePayload>change[Props.Payload]);
    case Action.Update:
      return createOrUpdate(<CreateAttributePayload>change[Props.Payload]);
    case Action.Delete:
      return remove(<DeleteAttributePayload>change[Props.Payload]);
  }
}

function createOrUpdate({ vNode, name, value }: CreateAttributePayload): void {
  if (BOOLEAN_ATTRIBUTES.has(name)) {
    // A boolean attribute is true by its presence alone: never write the
    // value verbatim. Falsy values remove (or omit) the attribute,
    // truthy values set the bare attribute name.
    if (!value) {
      (<HTMLElement>vNode[VNodeProps.NODE_REF]).removeAttribute(name);
      return;
    }
    if (name === "checked" && typeof value === "boolean") {
      (<HTMLFormElement>vNode[VNodeProps.NODE_REF])[name] = value;
      return;
    }
    (<HTMLElement>vNode[VNodeProps.NODE_REF]).setAttribute(name, "");
    return;
  }
  if (typeof value === "object" && value !== null) {
    // Only dangerouslySetInnerHTML takes an object; never "[object Object]".
    if (name === "dangerouslySetInnerHTML" && value.__html) {
      (<HTMLElement>vNode[VNodeProps.NODE_REF]).innerHTML = `${value.__html}`;
    }
    return;
  }
  if (name === "value" && value != null) {
    (<HTMLFormElement>vNode[VNodeProps.NODE_REF])[name] = String(value);
    return;
  }
  // The same rules as the server renderer (attributes.ts): invalid names,
  // string event handlers and javascript: URLs are left out; `true`/`false`
  // follow one rule.
  const text = attributeValue(name, value);
  if (text === undefined) {
    // An invalid name can't be on the element, and removeAttribute() would
    // throw on it.
    if (isValidAttributeName(name)) {
      (<HTMLElement>vNode[VNodeProps.NODE_REF]).removeAttribute(name);
    }
    return;
  }
  (<HTMLElement>vNode[VNodeProps.NODE_REF]).setAttribute(name, text);
}

function remove({ name, vNode }: DeleteAttributePayload): void {
  if (!isValidAttributeName(name)) return;
  if (name === "checked") {
    (<HTMLFormElement>vNode[VNodeProps.NODE_REF])[name] = false;
  }
  if (name === "value") {
    (<HTMLFormElement>vNode[VNodeProps.NODE_REF]).value = "";
  }
  (<HTMLElement>(<HasVNodeRef<Node>>vNode)[VNodeProps.NODE_REF]).removeAttribute(name);
}

export function compareAttributes(
  vNode: VElement<Node>,
  previousVNode: VElement<Node>,
): ChangeSet<unknown>[] {
  const changes: AttributeChangeSet[] = [];
  const props = vNode[VNodeProps.PROPS];
  const previousProps = previousVNode[VNodeProps.PROPS];

  for (const prop in props) {
    if (!isAttribute(prop, props[prop])) continue;

    // Compare dangerously set inner html
    if (prop === "dangerouslySetInnerHTML") {
      if (props[prop]?.__html !== previousProps[prop]?.__html) {
        changes.push(...setAttribute(prop, props[prop], vNode));
      }
      continue;
    }

    // Existence is checked by key: "" and false are valid previous values.
    if (hasOwn(previousProps, prop) && props[prop] === previousProps[prop]) {
      continue;
    }
    changes.push(...setAttribute(prop, props[prop], vNode));
  }

  // Remove attributes the vnode no longer renders
  for (const prop in previousProps) {
    if (
      isAttribute(prop, previousProps[prop]) &&
      (!hasOwn(props, prop) || !isAttribute(prop, props[prop]))
    ) {
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

  return changes;
}

// Object.hasOwn() is missing from browsers the bundler targets (Safari 15).
function hasOwn(object: object, prop: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, prop);
}

function isAttribute(prop: string, value: unknown): boolean {
  if (prop === "children") return false;
  if (prop === "dangerouslySetInnerHTML") return value != null;
  // Boolean attributes are diffed for any value: falsy ones are removed.
  return (
    BOOLEAN_ATTRIBUTES.has(prop) ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function setAttribute(
  key: string,
  value: unknown,
  vNode: VElement<Node>,
): AttributeChangeSet[] {
  if (BOOLEAN_ATTRIBUTES.has(key)) {
    // Diffing mirrors the boolean semantics of createOrUpdate: a truthy
    // value adds the bare attribute, a falsy value removes it.
    if (value) {
      return [
        {
          [Props.Action]: Action.Create,
          [Props.Type]: Type.Attribute,
          [Props.Payload]: {
            vNode,
            name: key,
            value: true,
          },
        },
      ];
    }
    return [
      {
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Delete,
        [Props.Payload]: {
          vNode,
          name: key,
        },
      },
    ];
  }
  // createOrUpdate() decides how `false` is written: `"false"` for
  // `aria-*` and `data-*`, left out otherwise.
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [
      {
        [Props.Action]: Action.Create,
        [Props.Type]: Type.Attribute,
        [Props.Payload]: {
          vNode,
          name: key,
          value,
        },
      },
    ];
  }
  if (key === "dangerouslySetInnerHTML") {
    return [
      {
        [Props.Action]: Action.Create,
        [Props.Type]: Type.Attribute,
        [Props.Payload]: {
          vNode,
          name: key,
          value: value as { __html: string },
        },
      },
    ];
  }
  return [];
}
