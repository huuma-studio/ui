import {
  type Cleanup,
  clearSubscriber,
  setSubscriber,
  type Subscriber,
} from "../state/mod.ts";
import type { JSX } from "../jsx-runtime/mod.ts";

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

/*
 * Add numbers manually to be able to resort the props
 * without reorder the numbers.
 */
export enum VNodeProps {
  TYPE = 0,
  HOOKS = 1,
  NODE_REF = 2,
  EVENT_REFS = 3,
  CHILDREN = 4,
  TEXT = 5,
  TAG = 6,
  FN = 7,
  PROPS = 8,
  MODE = 9,
  ID = 10,
  AST = 11,
  CLEANUP = 12,
  DEPTH = 13,
  KEY = 14,
  SKIP_ESCAPING = 15,
  OPTIONS = "_",
}
export type VState = JSX.StateLike;

export interface VBase {
  type: VType;
}

// deno-lint-ignore no-explicit-any
type VGlobalOptions = Record<string | number | symbol, any>;

type VOptions = {
  _GLOBAL: VGlobalOptions;
} & Record<string | number | symbol, unknown>;

export interface HasVOptions {
  [VNodeProps.OPTIONS]: VOptions;
}

export interface HasVHooks {
  [VNodeProps.HOOKS]?: VHooks;
}

export interface HasVChildren<T> {
  [VNodeProps.CHILDREN]?: VNode<T>[];
}

export interface HasVMode {
  [VNodeProps.MODE]: VMode;
}

export interface HasVCleanup {
  [VNodeProps.CLEANUP]: Cleanup[];
}

export interface HasVKey {
  [VNodeProps.KEY]?: number | string;
}

export interface VHooks {
  [VHook.ON_MOUNT]?: ((() => () => void) | (() => void))[];
  [VHook.ON_UNMOUNT]?: (() => void)[];
}

export enum VHook {
  ON_MOUNT,
  ON_UNMOUNT,
}

export interface HasVNodeRef<T> {
  [VNodeProps.NODE_REF]?: T;
}

export interface VText<T> extends VBase, HasVNodeRef<T> {
  type: VType.TEXT;
  [VNodeProps.TEXT]: string | VState;
  [VNodeProps.SKIP_ESCAPING]?: boolean;
}

export interface VElement<T>
  extends VBase,
    HasVNodeRef<T>,
    HasVChildren<T>,
    HasVCleanup,
    HasVOptions,
    HasVKey {
  type: VType.ELEMENT;
  [VNodeProps.TAG]: string;
  [VNodeProps.PROPS]: JSX.ElementProps;
  [VNodeProps.EVENT_REFS]: JSX.EventRef[];
}

export interface VComponent<T>
  extends VBase,
    HasVOptions,
    HasVHooks,
    HasVMode,
    HasVCleanup,
    HasVKey {
  type: VType.COMPONENT;
  [VNodeProps.FN]: JSX.Component;
  [VNodeProps.PROPS]: JSX.ElementProps;
  [VNodeProps.AST]: VNode<T>;
}

export interface VFragment<T>
  extends VBase,
    HasVChildren<T>,
    HasVOptions,
    HasVCleanup,
    HasVKey {
  type: VType.FRAGMENT;
}

export type VNode<T> =
  | VComponent<T>
  | VElement<T>
  | VText<T>
  | VFragment<T>
  | undefined
  | null;

const _scope: (VBase & HasVOptions)[] = [];
export function getScope(): (VBase & HasVOptions)[] {
  return [..._scope];
}

type VNodeStateUpdater<T, V> = (
  node: JSX.Element<string | JSX.Component | 0> | JSX.Node[],
  vNode: VComponent<T> | VElement<T> | VFragment<T>,
  globalOptions: VGlobalOptions,
) => Subscriber<V>;
let vNodeStateUpdater: VNodeStateUpdater<unknown, unknown> | undefined;

export function setVNodeUpdater(
  updater: VNodeStateUpdater<unknown, unknown>,
): void {
  vNodeStateUpdater = updater;
}

export function create<T>(
  node: JSX.Node,
  globalOptions: VGlobalOptions = {},
): VNode<T> {
  if (typeof node === "undefined") return;

  if (isEmptyNode(node)) {
    return null;
  }

  if (isTextNode(node)) {
    return vText(node);
  }

  if (isElementNode(node)) {
    return vElement(node, globalOptions);
  }

  if (isFragmentNode(node)) {
    return vFragment(node, globalOptions);
  }

  if (isComponentNode(node)) {
    return vComponent(node, globalOptions);
  }
}

export function vText<T>(node: string | number | JSX.StateLike): VText<T> {
  return {
    type: VType.TEXT,
    [VNodeProps.TEXT]: isVState(node) ? node : `${node}`,
  };
}

export function updateVText<T>(
  node: string | number | JSX.StateLike,
  vText: VText<T>,
): VText<T> {
  vText[VNodeProps.TEXT] = isVState(node) ? node : `${node}`;
  return vText;
}

export function vElement<T>(
  element: JSX.Element<string>,
  globalOptions: VGlobalOptions,
): VElement<T> {
  const { type, eventRefs, props, key } = element;
  const vElement: VElement<T> = {
    type: VType.ELEMENT,
    [VNodeProps.TAG]: type,
    [VNodeProps.KEY]: key,
    [VNodeProps.PROPS]: <JSX.ElementProps>props,
    [VNodeProps.EVENT_REFS]: eventRefs,
    [VNodeProps.OPTIONS]: { _GLOBAL: globalOptions },
    [VNodeProps.CLEANUP]: [],
  };

  _scope.push(vElement);
  setSubscriber(
    vNodeStateUpdater
      ? vNodeStateUpdater(element, vElement, globalOptions)
      : undefined,
  );
  vElement[VNodeProps.CHILDREN] = props.children?.map((child) => create(child));
  clearSubscriber();
  _scope.shift();

  return vElement;
}

function updateVElement<T>(
  element: JSX.Element<string>,
  vElement: VElement<T>,
  globalOptions: VGlobalOptions,
) {
  const { eventRefs, props } = element;

  vElement[VNodeProps.PROPS] = <JSX.ElementProps>props;
  vElement[VNodeProps.EVENT_REFS] = eventRefs;

  _scope.push(vElement);
  setSubscriber(
    vNodeStateUpdater
      ? vNodeStateUpdater(element, vElement, globalOptions)
      : undefined,
  );
  vElement[VNodeProps.CHILDREN] = track(
    vElement,
    props.children,
    globalOptions,
  );
  clearSubscriber();
  _scope.shift();

  return vElement;
}

function vComponent<T>(
  component: JSX.Element<JSX.Component>,
  globalOptions: VGlobalOptions,
) {
  const { type, props, key } = component;

  const vComponent: VComponent<T> = {
    type: VType.COMPONENT,
    [VNodeProps.KEY]: key,
    [VNodeProps.AST]: undefined,
    [VNodeProps.MODE]: VMode.NotCreated,
    [VNodeProps.FN]: type,
    [VNodeProps.CLEANUP]: [],
    [VNodeProps.PROPS]: props,
    [VNodeProps.OPTIONS]: { _GLOBAL: globalOptions },
  };

  _scope.push(vComponent);
  setSubscriber(
    vNodeStateUpdater
      ? vNodeStateUpdater(component, vComponent, globalOptions)
      : undefined,
  );
  vComponent[VNodeProps.AST] = create(vComponent[VNodeProps.FN](props));
  vComponent[VNodeProps.MODE] = VMode.Created;
  clearSubscriber();
  _scope.shift();

  return vComponent;
}

function updateVComponent<T>(
  component: JSX.Element<JSX.Component>,
  vComponent: VComponent<T>,
  globalOptions: VGlobalOptions,
) {
  _scope.push(vComponent);
  vComponent[VNodeProps.PROPS] = component.props;
  setSubscriber(
    vNodeStateUpdater
      ? vNodeStateUpdater(component, vComponent, globalOptions)
      : undefined,
  );
  const updatedNode = vComponent[VNodeProps.FN](vComponent[VNodeProps.PROPS]);
  clearSubscriber();
  _scope.shift();

  vComponent[VNodeProps.AST] = update(
    updatedNode,
    vComponent[VNodeProps.AST],
    globalOptions,
  );
  return vComponent;
}

function vFragment<T>(
  fragment: JSX.Element<0> | JSX.Node[],
  globalOptions: VGlobalOptions,
): VFragment<T> {
  const key = keyFrom(fragment);
  const props = propsFrom(fragment);
  const vFragment: VFragment<T> = {
    type: VType.FRAGMENT,
    [VNodeProps.KEY]: key,
    [VNodeProps.CHILDREN]: [],
    [VNodeProps.CLEANUP]: [],
    [VNodeProps.OPTIONS]: {
      _GLOBAL: globalOptions,
    },
  };

  _scope.push(vFragment);
  setSubscriber(
    vNodeStateUpdater
      ? vNodeStateUpdater(fragment, vFragment, globalOptions)
      : undefined,
  );
  vFragment[VNodeProps.CHILDREN] = props.children?.length
    ? props.children.map((child) => create(child))
    : [];
  clearSubscriber();
  _scope.shift();

  return vFragment;
}

function updateVFragment<T>(
  fragment: JSX.Element<0> | JSX.Node[],
  vFragment: VFragment<T>,
  globalOptions: VGlobalOptions,
): VFragment<T> {
  const props = propsFrom(fragment);
  _scope.push(vFragment);
  setSubscriber(
    vNodeStateUpdater
      ? vNodeStateUpdater(fragment, vFragment, globalOptions)
      : undefined,
  );
  vFragment[VNodeProps.CHILDREN] = track(
    vFragment,
    props.children,
    globalOptions,
  );
  clearSubscriber();
  _scope.shift();
  return vFragment;
}

export function update<T>(
  node: JSX.Node,
  vNode: VNode<T> | undefined,
  globalOptions: VGlobalOptions,
  cleanupVNode = false,
): VNode<T> {
  /*
   * Root update call should cleanup the vNode.
   * Subsequent nested update calls do not need to cleanup.
   */
  if (cleanupVNode) {
    cleanup(vNode);
  }

  if (isEmptyNode(node) || typeof node === "undefined") {
    return null;
  }

  // VText
  if (isTextNode(node)) {
    // If not vText cleanup old vNode
    if (vNode?.type === VType.TEXT) {
      return updateVText(node, vNode);
    }
    return vText(node);
  }

  // VElement
  if (isElementNode(node)) {
    if (vNode?.type === VType.ELEMENT && node.type === vNode[VNodeProps.TAG]) {
      // Update vElement
      return updateVElement(<JSX.Element<string>>node, vNode, globalOptions);
    }
    // Create vElement
    return vElement(node, globalOptions);
  }

  // VComponent
  if (isComponentNode(node)) {
    if (vNode?.type === VType.COMPONENT && vNode[VNodeProps.FN] === node.type) {
      return updateVComponent(node, vNode, globalOptions);
    }
    // Create vComponent
    return vComponent(node, globalOptions);
  }

  // VFragment
  if (isFragmentNode(node)) {
    if (vNode?.type === VType.FRAGMENT) {
      updateVFragment(node, vNode, globalOptions);
    }
    return vFragment(node, globalOptions);
  }
}

function track<T>(
  vNode: VElement<T> | VFragment<T>,
  nodes: JSX.Node[] | undefined,
  globalOptions: VGlobalOptions,
): VNode<T>[] {
  const vNodes = vNode[VNodeProps.CHILDREN] || [];

  // No previous vNodes. Create the new children
  if (!vNodes?.length) {
    vNode[VNodeProps.CHILDREN] = nodes?.map((node) => create(node));
  }

  // No new children
  if (!nodes?.length) {
    vNode[VNodeProps.CHILDREN] = undefined;
    return [];
  }

  // Update
  let i = 0;
  const children = [];
  for (const node of nodes) {
    children.push(update(node, vNodes[i], globalOptions));
    i++;
  }
  return vNodes;
}

export function isEmptyNode(node: JSX.Node): node is boolean | null {
  return typeof node === "boolean" || node === null;
}

export function isTextNode(
  value: JSX.Node,
): value is string | number | JSX.StateLike {
  return (
    value != null &&
    (typeof value === "string" || Number.isFinite(value) || isVState(value))
  );
}

export function isFragmentNode(
  node: JSX.Node,
): node is JSX.Node[] | JSX.Element<0> {
  return (
    (typeof node === "object" && node && "type" in node && node.type === 0) ||
    Array.isArray(node)
  );
}

export function isElementNode(node: JSX.Node): node is JSX.Element<string> {
  return (
    (node &&
      typeof node === "object" &&
      "type" in node &&
      typeof node.type === "string") ||
    false
  );
}

export function isComponentNode(
  node: JSX.Node,
): node is JSX.Element<JSX.Component> {
  return (
    (node &&
      typeof node === "object" &&
      "type" in node &&
      typeof node.type === "function") ||
    false
  );
}

export function isVComponent<T>(
  vNode: undefined | null | VBase,
): vNode is VComponent<T> {
  return vNode?.type === VType.COMPONENT;
}

export function isVElement<T>(
  vNode: undefined | null | VBase,
): vNode is VElement<T> {
  return vNode?.type === VType.ELEMENT;
}

export function isVFragment<T>(
  vNode: undefined | null | VBase,
): vNode is VFragment<T> {
  return vNode?.type === VType.FRAGMENT;
}

export function isVText<T>(vNode: undefined | null | VBase): vNode is VText<T> {
  return vNode?.type === VType.TEXT;
}

export function isVState(node: JSX.Node): node is VState {
  return (node && typeof node === "object" && "get" in node) || false;
}

export function cleanup(vNode: VNode<unknown>) {
  if (vNode && VNodeProps.CLEANUP in vNode) {
    vNode[VNodeProps.CLEANUP].forEach((c) => c());
  }

  if (isVComponent(vNode)) {
    cleanup(vNode[VNodeProps.AST]);
  }

  if (isVElement(vNode) || isVFragment(vNode)) {
    if (vNode[VNodeProps.CHILDREN]?.length) {
      for (const child of vNode[VNodeProps.CHILDREN]) {
        cleanup(child);
      }
    }
  }
}

export function copy<T>(vNode: VNode<T>): VNode<T> {
  if (isVText(vNode)) {
    return {
      ...vNode,
    };
  }
  if (isVElement(vNode)) {
    const copyChildren = vNode[VNodeProps.CHILDREN]?.map((child) =>
      copy(child),
    );
    return { ...vNode, [VNodeProps.CHILDREN]: copyChildren };
  }
  if (isVComponent(vNode)) {
    const copyAst = copy(vNode[VNodeProps.AST]);
    return { ...vNode, [VNodeProps.AST]: copyAst };
  }
  if (isVFragment(vNode)) {
    const copyChildren = vNode[VNodeProps.CHILDREN]?.map((child) =>
      copy(child),
    );
    return {
      ...vNode,
      [VNodeProps.CHILDREN]: copyChildren,
    };
  }
  return vNode;
}

function propsFrom(node: JSX.Element<0> | JSX.Node[]): JSX.ElementProps {
  if (Array.isArray(node)) return { children: node };
  return node.props;
}

function keyFrom(
  node: JSX.Element<0> | JSX.Node[],
): string | number | undefined {
  if (Array.isArray(node)) return undefined;
  return node.key;
}
