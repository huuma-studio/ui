import { eventName, isEventName } from "./event.ts";

declare global {
  export namespace JSX {
    type TextNode = string | number | StateLike;
    type EmptyNode = undefined | null | boolean;

    type Node =
      | TextNode
      | EmptyNode
      | Element<string | Component | 0>;

    type Element<T extends string | Component | 0> = {
      type: T; // Fragment;
      eventRefs: EventRef[];
      props: ElementProps;
      key?: string | number;
    };

    type Component = (props: ElementProps) => Node;

    type StateLike = {
      get: string | number;
      subscribe: (
        subscriber: { update: (value: string) => void },
      ) => () => void;
    };

    type EventRef = {
      name: string;
      listener: () => void;
    };

    type ElementProps = {
      children?: Node[];
      unsafeInnerHTML?: string;
      [type: string]: unknown;
    };

    type IntrinsicElements = {
      [key: string]: unknown;
    };
  }
}

export function jsx(
  type: string | JSX.Component,
  props: JSX.ElementProps,
  key: string | number,
): JSX.Element<string | JSX.Component | 0> {
  const eventRefs: JSX.EventRef[] = [];

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
    props.children = props.children ? [props.children] : undefined;
  }

  return {
    type: type === Fragment ? 0 : type,
    key,
    props,
    eventRefs,
  };
}

export function Fragment(props: JSX.ElementProps): JSX.Node[] | undefined {
  return props.children;
}
