import { Fragment } from "./jsx.ts";
import {
  Cleanup,
  clearSubscriber,
  setSubscriber,
  type Subscriber,
} from "./state/state.ts";

export const scope: VComponent<unknown>[] = [];

export enum VMode {
  NotCreated,
  Created,
}

export enum VType {
  TEXT,
  ELEMENT,
  COMPONENT,
  FRAGMENT,
}

export enum VNodeProps {
  TYPE,
  HOOKS,
  NODE_REF,
  EVENT_REFS,
  CHILDREN,
  TAG,
  FN,
  PROPS,
  MODE,
  ID,
  AST,
  CLEANUP,
}
export type VState = JSX.StateLike;

export interface VBase {
  type: VType;
}

export interface VHooks {
  [VHook.ON_MOUNT]?: ((() => () => void) | (() => void))[];
  [VHook.ON_DESTROY]?: (() => void)[];
}

export enum VHook {
  ON_MOUNT,
  ON_DESTROY,
}

export interface VNodeRef<T> extends VBase {
  nodeRef?: T;
  eventRefs: JSX.EventRef[];
  children?: VNode<T>[];
}

export interface VElement<T> extends VNodeRef<T> {
  type: VType.ELEMENT;
  tag: string;
  props: JSX.ElementProps;
}

export interface VText<T> extends VNodeRef<T> {
  type: VType.TEXT;
  text: string | VState;
}

export interface VComponent<T> extends VBase {
  type: VType.COMPONENT;
  mode: VMode;
  fn: JSX.Component;
  props: JSX.ElementProps;
  ast: VNode<T>;
  [VNodeProps.CLEANUP]: Cleanup[];
  [VNodeProps.HOOKS]?: VHooks;
}

export interface VFragment<T> extends VBase {
  type: VType.FRAGMENT;
  children?: VNode<T>[];
}

export type VNode<T> =
  | VComponent<T>
  | VElement<T>
  | VText<T>
  | VFragment<T>
  | undefined
  | null;

type VComponentUpdater<T, V> = (component: VComponent<T>) => Subscriber<V>;

let vComponentUpdater: VComponentUpdater<unknown, unknown> | undefined;

export function setComponentUpdater(
  updater: VComponentUpdater<unknown, unknown>,
): void {
  vComponentUpdater = updater;
}

export function create<T>(node: JSX.Node): VNode<T> {
  if (typeof node === "undefined") return;

  if (isEmptyNode(node)) {
    return null;
  }

  if (isTextNode(node)) {
    return vText(node);
  }

  if (node.type === 0) {
    return vFragment(<JSX.Element<0>>node);
  }

  if (typeof node.type === "string") {
    return vElement(<JSX.Element<string>>node);
  }

  if (typeof node.type === "function") {
    return vComponent(<JSX.Element<JSX.Component>>node);
  }
}

export function vText<T>(node: string | number | JSX.StateLike): VText<T> {
  return {
    type: VType.TEXT,
    text: typeof node === "object" && "get" in node ? node : `${node}`,
    eventRefs: [],
  };
}

export function vElement<T>(node: JSX.Element<string>): VElement<T> {
  const { type, eventRefs, props, ...rest } = node;

  return {
    type: VType.ELEMENT,
    tag: type,
    props: <JSX.ElementProps>props,
    eventRefs,
    children: props.children?.map((child) => {
      return create(child);
    }),
    ...rest,
  };
}

function vComponent<T>(node: JSX.Element<JSX.Component>) {
  if (typeof node.type !== "function" || node.type === Fragment) {
    throw new Error("Component is not a function");
  }

  const { type, props } = node;

  const component: VComponent<T> = {
    type: VType.COMPONENT,
    ast: undefined,
    mode: VMode.NotCreated,
    fn: type,
    [VNodeProps.CLEANUP]: [],
    props,
  };

  scope.push(component);
  setSubscriber(vComponentUpdater ? vComponentUpdater(component) : undefined);
  component.ast = create(component.fn(props));
  component.mode = VMode.Created;
  clearSubscriber();
  scope.shift();

  return component;
}

function vFragment<T>(node: JSX.Element<0>): VFragment<T> {
  return {
    type: VType.FRAGMENT,
    children: node.props.children?.map((child) => create(child)),
  };
}

// TODO: Move type-guard to appropriate location
export function isTextNode(
  value: unknown,
): value is string | number | JSX.StateLike {
  return (
    value != null &&
    (typeof value === "string" ||
      Number.isFinite(value) ||
      (typeof value === "object" && "get" in value))
  );
}

export function isEmptyNode(value: unknown): value is boolean | null {
  return typeof value === "boolean" || value === null;
}
