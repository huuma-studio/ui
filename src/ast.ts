import {
  clearSubscriber,
  setSubscriber,
  type Subscriber,
  Unsubscribe,
} from "./state/mod.ts";
import "./types.ts";

export const scope: VComponent<unknown>[] = [];

export enum VMode {
  NotCreated,
  Created,
}

export enum VType {
  TEXT,
  ELEMENT,
  COMPONENT,
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

export interface ElementProps<T> {
  [key: string]: unknown;
  children?: VNode<T>[];
}

export interface VBase {
  type: VType;
}

export interface VHooks {
  onMount?: ((() => () => void) | (() => void))[];
  onDestroy?: (() => void)[];
}

export interface VNodeRef<T> extends VBase {
  nodeRef?: T;
  eventRefs: JSX.EventRef[];
  children?: VNode<T>[];
}

export interface VElement<T> extends VNodeRef<T> {
  type: VType.ELEMENT;
  tag: string;
  props: ElementProps<T>;
}

export interface VText<T> extends VNodeRef<T> {
  type: VType.TEXT;
  text: string | VState;
}

export interface VComponent<T> extends VBase {
  type: VType.COMPONENT;
  mode: VMode;
  id: symbol;
  fn: JSX.Component;
  props: JSX.ElementProps;
  ast: VNode<T>;
  [VNodeProps.CLEANUP]: Unsubscribe[];
  hooks?: VHooks;
}

export type VNode<T> =
  | VComponent<T>
  | VElement<T>
  | VText<T>
  | undefined
  | null;

type VComponentUpdater<T, V> = (component: VComponent<T>) => Subscriber<V>;

let vComponentUpdater: VComponentUpdater<unknown, unknown> | undefined;

export function setComponentUpdater(
  updater: VComponentUpdater<unknown, unknown>,
): void {
  vComponentUpdater = updater;
}

export function create<T>(node: JSX.Node | VComponent<T>): VNode<T> {
  if (typeof node === "undefined") return;

  if (isEmptyNode(node)) {
    return null;
  }

  if (isTextNode(node)) {
    return vText(node);
  }

  if ("tag" in node && typeof node.tag === "string") {
    return vElement(node);
  }

  if (("tag" in node && typeof node.tag === "function")) {
    return createVComponent(node);
  }

  if (
    ("fn" in node && typeof node.fn === "function")
  ) {
    return updateVComponent(node);
  }
}

function vText<T>(node: string | number | JSX.StateLike): VText<T> {
  return {
    type: VType.TEXT,
    text: (typeof node === "object" && "get" in node) ? node : `${node}`,
    eventRefs: [],
  };
}

function vElement<T>(node: JSX.Element, vNode?: VElement<T>): VElement<T> {
  const { tag, children, eventRefs, props, ...rest } = node;

  return {
    type: VType.ELEMENT,
    tag: <string> tag,
    props: <ElementProps<T>> props,
    eventRefs,
    children: children?.map((child, i) => {
      // TODO: Find a way to track VComponents with state.
      return vNode
        ? update(child, vNode.children ? vNode.children[i] : null)
        : create(child);
    }),
    ...rest,
  };
}

function createVComponent<T>(node: JSX.Element) {
  if (typeof node.tag !== "function") {
    throw new Error(
      "Component is not a function",
    );
  }

  const { tag, props, children } = node;

  props.children = children;

  const component: VComponent<T> = {
    type: VType.COMPONENT,
    ast: undefined,
    id: Symbol(),
    mode: VMode.NotCreated,
    fn: tag,
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

function updateVComponent<T>(vComponent: VComponent<T>) {
  scope.push(vComponent);
  const node = vComponent.fn(vComponent.props);
  scope.shift();

  vComponent.ast = update(node, vComponent.ast);
  return vComponent;
}

function update<T>(node: JSX.Node, vNode: VNode<T>): VNode<T> {
  if (typeof node === "undefined") return;

  if (isEmptyNode(node)) {
    if (vNode?.type === VType.COMPONENT) {
      unsubscribe(vNode);
    }

    return null;
  }

  if (isTextNode(node)) {
    return vText(node);
  }

  if (typeof node.tag === "string") {
    if (vNode?.type === VType.ELEMENT && node.tag === vNode.tag) {
      return vElement(node, vNode);
    }
    return vElement(node);
  }

  if (typeof node.tag === "function") {
    if (vNode?.type === VType.COMPONENT && vNode.fn === node.tag) {
      const { children, props } = node;
      props.children = children;
      vNode.props = props;
      return updateVComponent(vNode);
    }
    return createVComponent(node);
  }
}

// TODO: Move type-guard to appropriate location
function isTextNode(
  value: unknown,
): value is string | number | JSX.StateLike {
  return (
    value != null && (
      typeof value === "string" ||
      (Number.isFinite(value)) ||
      (typeof value === "object" && "get" in value)
    )
  );
}

function isEmptyNode(value: unknown): value is boolean | null {
  return (typeof value === "boolean" || value === null);
}

// TODO: Integrate more performant solution so unsubscribe from states
function unsubscribe(vNode: VNode<unknown>) {
  if (vNode?.type === VType.COMPONENT) {
    vNode[VNodeProps.CLEANUP].forEach((unsub) => unsub());
    unsubscribe(vNode.ast);
  }
  if (vNode?.type === VType.ELEMENT && vNode.children) {
    for (const child of vNode.children) {
      unsubscribe(child);
    }
  }
}

export function copy<T>(vNode: VNode<T>): VNode<T> {
  if (vNode?.type === VType.COMPONENT) {
    const copyAst = copy(vNode.ast);
    return { ...vNode, ast: copyAst };
  }
  if (vNode?.type === VType.ELEMENT) {
    const copyChildren = vNode.children?.map((child) => copy(child));
    return { ...vNode, children: copyChildren };
  }
  if (vNode?.type === VType.TEXT) {
    return {
      ...vNode,
    };
  }
  return vNode;
}
