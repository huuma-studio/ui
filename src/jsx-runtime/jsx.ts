import { eventName, isEventName } from "./event.ts";
import { escapeHtml } from "../utils/escape-html.ts";

// deno-lint-ignore no-namespace
export namespace JSX {
  export type TextNode = string | number | StateLike;
  export type EmptyNode = undefined | null | boolean;

  export type Node =
    | TextNode
    | EmptyNode
    | Element<string | Component | 0>
    | Node[] // Element<0> and Node[] are handled as framgent
    | Template;

  export type Element<T extends string | Component | 0> = {
    type: T; // Fragment = 0;
    eventRefs: EventRef[];
    props: ElementProps;
    key?: string | number;
  };

  export type Template = {
    templates: string[];
    nodes: JSX.Node[];
  };

  export type Component = (props: ElementProps) => Node;

  export type StateLike = {
    get: string | number;
    subscribe: (subscriber: { update: (value: string) => void }) => () => void;
  };

  export type EventRef = {
    name: string;
    listener: () => void;
  };

  export type ElementProps = {
    children?: Node[];
  } & IntrinsicElements;

  export type IntrinsicElements = {
    dangerouslySetInnerHTML?: { __html: string };
    [key: string]: unknown;
  };
}

export function jsx(
  type: string | JSX.Component,
  props?: JSX.ElementProps,
  key?: string | number,
): JSX.Element<string | JSX.Component | 0> {
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

export function jsxAttr(name: string, value: unknown): JSX.Node {
  if (typeof value === "string") {
    return {
      templates: [`${escapeHtml(name)}="${escapeHtml(value)}"`],
      nodes: [""],
    };
  }
  return "";
}

export function jsxEscape(node: JSX.Node): JSX.Node {
  return node;
}

export function jsxTemplate(
  templates: string[],
  ...nodes: JSX.Node[]
): JSX.Template {
  return { templates, nodes };
}

export function Fragment(props: JSX.ElementProps): JSX.Node[] | null {
  return props.children || null;
}
