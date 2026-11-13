import { escape } from "../utils/escape.ts";

import { attributeValue } from "./attributes.ts";
import { eventName, isEventName } from "./event.ts";
import { BOOLEAN_ATTRIBUTES } from "./boolean-attributes.ts";
import type { Signal } from "../signal/mod.ts";
import { Ref } from "../ref/mod.ts";

// deno-lint-ignore no-namespace
export namespace JSX {
  export type SignalValue = EmptyNode | string | number;
  export type SignalLike = Signal<SignalValue>;
  export type TextNode = string | number | SignalLike;
  export type EmptyNode = undefined | null | boolean;

  export type ComponentNode<T extends string | Component | 0> = {
    type: T; // Element = string, Component = Component, Fragment = 0;
    eventRefs: EventRef[];
    props: ComponentProps;
    bind?: Ref<unknown>;
    key?: string | number;
  };

  export type TemplateNode = {
    templates: string[];
    nodes: Element[];
  };

  export type Element =
    | TextNode
    | EmptyNode
    | ComponentNode<string | Component | 0>
    | Element[] // ComponentNode<0> and Element[] are handled as fragment
    | TemplateNode;

  export type IntrinsicElements = {
    [K in keyof HTMLElementTagNameMap]: Attributes;
  } & {
    [K in keyof SVGElementTagNameMap]: Attributes;
  };

  export type Attributes = {
    [key: string]: unknown;
    key?: unknown;
    bind?: Ref<unknown>;
    dangerouslySetInnerHTML?: { __html: string };
  };

  export interface ElementChildrenAttribute {
    children: Element;
  }

  export type Component = (
    // `any` (not ComponentProps) so components can declare their own props.
    // deno-lint-ignore no-explicit-any
    props: any,
  ) => Element | Promise<Element>;

  export type ElementType = Component | keyof IntrinsicElements;

  export type EventRef = {
    name: string;
    listener: () => void;
  };

  export type ComponentProps = {
    children?: Element;
    key?: unknown;
    dangerouslySetInnerHTML?: { __html: string };
    [key: string]: unknown;
  };
}

export function jsx(
  type: string | JSX.Component,
  props?: JSX.ComponentProps,
  key?: string | number,
): JSX.Element {
  const eventRefs: JSX.EventRef[] = [];
  props ??= {};
  let bind: Ref<null> | undefined;

  if (typeof type === "string") {
    for (const prop in props) {
      if (prop === "bind" && props[prop] instanceof Ref) {
        bind = props[prop];
        delete props[prop];
      } else if (isEventName(prop)) {
        eventRefs.push({
          name: eventName(prop),
          listener: <() => void>props[prop],
        });
        delete props[prop];
      }
    }
  }

  if (!Array.isArray(props.children)) {
    props.children =
      typeof props.children !== "boolean" && props.children != null ? [props.children] : undefined;
  }

  return {
    type: type === Fragment ? 0 : type,
    props,
    bind,
    eventRefs,
    key,
  };
}

/**
 * The classic `createElement(type, props, ...children)`. The automatic JSX
 * runtime falls back to it, imported from `@huuma/ui`, when `key` follows a
 * spread: `<div {...props} key="a" />`.
 */
export function createElement(
  type: string | JSX.Component,
  config?: JSX.ComponentProps | null,
  ...children: JSX.Element[]
): JSX.Element {
  // The development transform adds __self and __source, which aren't props.
  const { key, __self: _self, __source: _source, ...props } = config ?? {};
  if (children.length) {
    props.children = children.length === 1 ? children[0] : children;
  }
  return jsx(type, props, (key ?? undefined) as string | number | undefined);
}

export function jsxAttr(name: string, value: unknown): JSX.Element {
  // The same rules as the renderer: invalid names, string event handlers
  // and javascript: URLs are left out (attributes.ts).
  const text = attributeValue(name, value);
  if (text === undefined) return "";
  // `true` and boolean attributes as the bare name, the same as `=""`.
  const bare = text === "" && (value === true || BOOLEAN_ATTRIBUTES.has(name));
  return { templates: [bare ? name : `${name}="${escape(text)}"`], nodes: [""] };
}

/**
 * The precompile transform wraps each dynamic child of a template in
 * `jsxEscape()`. It doesn't escape on purpose: the child becomes one of the
 * template's `nodes`, which are rendered like any JSX child, so text in it
 * is escaped once, by the renderer. Escaping here too would escape it twice
 * (`<` → `&lt;` → `&amp;lt;`). Only the template's static strings, which
 * come from the source code, are written as they are; dynamic attributes go
 * through `jsxAttr()`, which escapes their value itself.
 */
export function jsxEscape(node: JSX.Element): JSX.Element {
  return node;
}

export function jsxTemplate(templates: string[], ...nodes: JSX.Element[]): JSX.TemplateNode {
  return { templates, nodes };
}

export function Fragment({ children }: JSX.ComponentProps): JSX.Element {
  return children;
}
