import { eventName, isEventName } from "./event.ts";
import { escape } from "@std/html/entities";
import type { Signal } from "../signal/mod.ts";

// deno-lint-ignore no-namespace
export namespace JSX {
  export type SignalLike = Signal<EmptyNode | TextNode>;
  export type TextNode = string | number | SignalLike;
  export type EmptyNode = undefined | null | boolean;

  export type ComponentNode<T extends string | Component | 0> = {
    type: T; // Fragment = 0;
    eventRefs: EventRef[];
    props: ComponentProps;
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

  export type IntrinsicElements =
    & {
      [K in keyof HTMLElementTagNameMap]: Attributes;
    }
    & {
      [K in keyof SVGElementTagNameMap]: Attributes;
    };

  export type Attributes = {
    [key: string]: unknown;
    children?: Element;
    key?: unknown;
    dangerouslySetInnerHTML?: { __html: string };
  };

  export interface ElementChildrenAttribute {
    children: Element;
  }

  export type Component = (
    // deno-lint-ignore no-explicit-any
    props: ComponentProps & any,
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

  for (const prop in props) {
    if (isEventName(prop)) {
      eventRefs.push({
        name: eventName(prop),
        listener: <() => void> props[prop],
      });
      delete props[prop];
    }
  }

  if (!Array.isArray(props.children)) {
    props.children =
      (typeof props.children !== "boolean" && props.children != null)
        ? [props.children]
        : undefined;
  }

  return {
    type: type === Fragment ? 0 : type,
    props,
    eventRefs,
    key,
  };
}

export function jsxAttr(name: string, value: unknown): JSX.Element {
  if (typeof value === "string") {
    return {
      templates: [`${escape(name)}="${escape(value)}"`],
      nodes: [""],
    };
  }
  return "";
}

// TODO: Properly implement and test escape here!
export function jsxEscape(node: JSX.Element): JSX.Element {
  return node;
}

export function jsxTemplate(
  templates: string[],
  ...nodes: JSX.Element[]
): JSX.TemplateNode {
  return { templates, nodes };
}

export function Fragment({ children }: JSX.ComponentProps): JSX.Element {
  return children;
}
