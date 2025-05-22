import type { JSX } from "../jsx-runtime/mod.ts";
import { type Cleanup, setSubscriber, type Subscriber } from "../signal/mod.ts";

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
export type VSignal = JSX.SignalLike;

export interface VBase {
  type: VType;
}

export type VNodeBeforeCreateVisitor = (jsx: JSX.Element) => JSX.Element;

export interface VNodeVisitor {
  beforeCreate?: VNodeBeforeCreateVisitor;
}

export type VGlobalOptions =
  & VNodeVisitor
  // deno-lint-ignore no-explicit-any
  & Record<string | number | symbol, any>;

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
  [VHook.MOUNT]?: ((() => () => void) | (() => void))[];
  [VHook.UNMOUNT]?: (() => void)[];
}

export enum VHook {
  MOUNT,
  UNMOUNT,
}

export interface HasVNodeRef<T> {
  [VNodeProps.NODE_REF]?: T;
}

export interface VText<T> extends VBase, HasVNodeRef<T>, HasVCleanup {
  type: VType.TEXT;
  [VNodeProps.TEXT]: string | VSignal;
  [VNodeProps.SKIP_ESCAPING]?: boolean;
}

export interface VElement<T>
  extends VBase, HasVNodeRef<T>, HasVChildren<T>, HasVOptions, HasVKey {
  type: VType.ELEMENT;
  [VNodeProps.TAG]: string;
  [VNodeProps.PROPS]: JSX.ComponentProps;
  [VNodeProps.EVENT_REFS]: JSX.EventRef[];
}

export interface VComponent<T>
  extends
    VBase,
    HasVOptions,
    HasVHooks,
    HasVMode,
    HasVCleanup,
    HasVKey,
    HasVNodeRef<T> {
  type: VType.COMPONENT;
  [VNodeProps.FN]: JSX.Component;
  [VNodeProps.PROPS]: JSX.ComponentProps;
  [VNodeProps.AST]: VNode<T>;
}

export interface VFragment<T>
  extends VBase, HasVChildren<T>, HasVOptions, HasVKey {
  type: VType.FRAGMENT;
}

export type VNode<T> =
  | VComponent<T>
  | VElement<T>
  | VText<T>
  | VFragment<T>
  | undefined
  | null;

const _vNodeScope: (VBase & HasVOptions)[] = [];
export function getVNodeScope(): (VBase & HasVOptions)[] {
  return [..._vNodeScope];
}

type VNodeSignalUpdater<T, V> = (
  node: JSX.ComponentNode<JSX.Component>,
  vNode: VComponent<T>,
  globalOptions: VGlobalOptions,
) => Subscriber<V>;
let vNodeSignalUpdater: VNodeSignalUpdater<unknown, unknown> | undefined;

export function setVNodeUpdater<T>(
  updater: VNodeSignalUpdater<T, unknown>,
): void {
  vNodeSignalUpdater = <VNodeSignalUpdater<unknown, unknown>> updater;
}

export function create<T>(
  node: JSX.Element,
  globalOptions: VGlobalOptions = {},
): VNode<T> {
  if (typeof globalOptions.beforeCreate === "function") {
    node = globalOptions.beforeCreate(node);
  }

  if (isEmptyNode(node)) {
    return null;
  }

  if (isTextNode(node)) {
    return vText(node);
  }

  if (isElementNode(node)) {
    return vElement(node, globalOptions);
  }

  if (isFragmentNode(node) || isTemplateNode(node)) {
    return vFragment(node, globalOptions);
  }

  if (isComponentNode(node)) {
    return vComponent(node, globalOptions);
  }
}

export function update<T>(
  node: JSX.Element,
  vNode: VNode<T> | undefined,
  globalOptions: VGlobalOptions,
  cleanupVNode = true,
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

  if (isTextNode(node)) {
    if (vNode?.type === VType.TEXT) {
      return updateVText(node, vNode);
    }
    return vText(node);
  }

  if (isElementNode(node)) {
    if (
      vNode?.type === VType.ELEMENT && node.type === vNode[VNodeProps.TAG] &&
      vNode[VNodeProps.KEY] === node.key
    ) {
      return updateVElement(
        <JSX.ComponentNode<string>> node,
        vNode,
        globalOptions,
      );
    }
    return vElement(node, globalOptions);
  }

  if (isComponentNode(node)) {
    if (
      isVComponent(vNode) && vNode[VNodeProps.FN] === node.type &&
      vNode[VNodeProps.KEY] === node.key
    ) {
      return updateVComponent(node, vNode, globalOptions);
    }
    return vComponent(node, globalOptions);
  }

  if (isFragmentNode(node)) {
    if (
      vNode?.type === VType.FRAGMENT
    ) {
      return updateVFragment(node, vNode, globalOptions);
    }
    return vFragment(node, globalOptions);
  }
}

function vText<T>(
  node: string | number | JSX.SignalLike,
  options?: {
    skipEscaping?: boolean;
  },
): VText<T> {
  return {
    type: VType.TEXT,
    [VNodeProps.TEXT]: isVSignal(node) ? node : `${node}`,
    [VNodeProps.SKIP_ESCAPING]: options?.skipEscaping ?? false,
    [VNodeProps.CLEANUP]: [],
  };
}

function updateVText<T>(
  node: string | number | JSX.SignalLike,
  vText: VText<T>,
): VText<T> {
  vText[VNodeProps.TEXT] = isVSignal(node) ? node : `${node}`;
  return vText;
}

export function vElement<T>(
  element: JSX.ComponentNode<string>,
  globalOptions: VGlobalOptions,
): VElement<T> {
  const { type, eventRefs, props, key } = element;
  const vElement: VElement<T> = {
    type: VType.ELEMENT,
    [VNodeProps.TAG]: type,
    [VNodeProps.KEY]: key,
    [VNodeProps.PROPS]: props,
    [VNodeProps.EVENT_REFS]: eventRefs,
    [VNodeProps.CHILDREN]: [],
    [VNodeProps.OPTIONS]: { _GLOBAL: globalOptions },
  };

  vElement[VNodeProps.CHILDREN] = Array.isArray(props.children)
    ? props.children?.map((child) => create(child, globalOptions))
    : [create(props.children)];

  return vElement;
}

function updateVElement<T>(
  element: JSX.ComponentNode<string>,
  vElement: VElement<T>,
  globalOptions: VGlobalOptions,
) {
  const { eventRefs, props } = element;

  vElement[VNodeProps.PROPS] = <JSX.ComponentProps> props;
  vElement[VNodeProps.EVENT_REFS] = eventRefs;

  vElement[VNodeProps.CHILDREN] = track(
    vElement[VNodeProps.CHILDREN],
    Array.isArray(props.children) ? props.children : [props.children],
    globalOptions,
  );

  return vElement;
}

function vComponent<T>(
  component: JSX.ComponentNode<JSX.Component>,
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

  _vNodeScope.push(vComponent);
  typeof vNodeSignalUpdater === "function"
    ? setSubscriber(
      () => {
        const node = throwIfPromise(vComponent[VNodeProps.FN](props));
        return vComponent[VNodeProps.AST] = create(
          node,
          globalOptions,
        );
      },
      vNodeSignalUpdater(component, vComponent, globalOptions),
    )
    : vComponent[VNodeProps.AST] = create(
      throwIfPromise(vComponent[VNodeProps.FN](props)),
      globalOptions,
    );
  vComponent[VNodeProps.MODE] = VMode.Created;
  _vNodeScope.shift();

  return vComponent;
}

function updateVComponent<T>(
  component: JSX.ComponentNode<JSX.Component>,
  vComponent: VComponent<T>,
  globalOptions: VGlobalOptions,
) {
  _vNodeScope.push(vComponent);
  vComponent[VNodeProps.PROPS] = component.props;
  const updatedNode = typeof vNodeSignalUpdater === "function"
    ? setSubscriber(
      () => {
        return vComponent[VNodeProps.FN](vComponent[VNodeProps.PROPS]);
      },
      vNodeSignalUpdater(component, vComponent, globalOptions),
    )
    : vComponent[VNodeProps.FN](vComponent[VNodeProps.PROPS]);

  _vNodeScope.shift();

  vComponent[VNodeProps.AST] = update(
    throwIfPromise(updatedNode),
    vComponent[VNodeProps.AST],
    globalOptions,
    false,
  );
  return vComponent;
}

function vFragment<T>(
  fragment: JSX.ComponentNode<0> | JSX.Element[] | JSX.TemplateNode,
  globalOptions: VGlobalOptions,
): VFragment<T> {
  const vFragment: VFragment<T> = {
    type: VType.FRAGMENT,
    [VNodeProps.KEY]: keyFrom(fragment),
    [VNodeProps.CHILDREN]: [],
    [VNodeProps.OPTIONS]: {
      _GLOBAL: globalOptions,
    },
  };

  const children: VNode<T>[] = [];
  if (isTemplateNode(fragment)) {
    for (const template of fragment.templates) {
      children.push(
        vText(template, { skipEscaping: true }),
        create(fragment.nodes?.shift(), globalOptions),
      );
    }
  } else {
    const _nodes = childrenFrom(fragment);
    const nodes = Array.isArray(_nodes) ? _nodes : [_nodes];
    for (const node of nodes) {
      children.push(create(node, globalOptions));
    }
  }
  vFragment[VNodeProps.CHILDREN] = children;
  return vFragment;
}

function updateVFragment<T>(
  fragment: JSX.ComponentNode<0> | JSX.Element[],
  vFragment: VFragment<T>,
  globalOptions: VGlobalOptions,
): VFragment<T> {
  const _children = childrenFrom(fragment);
  const children = Array.isArray(_children) ? _children : [_children];
  vFragment[VNodeProps.CHILDREN] = track(
    vFragment[VNodeProps.CHILDREN],
    children,
    globalOptions,
  );
  return vFragment;
}

function track<T>(
  vChildren: VNode<T>[] = [],
  nodes: JSX.Element[] | undefined,
  globalOptions: VGlobalOptions,
): VNode<T>[] {
  // No new nodes
  if (!nodes?.length) {
    return [];
  }

  // No previous nodes.
  if (!vChildren?.length) {
    return nodes.map((node) => create(node, globalOptions));
  }

  // Update
  // TODO: use key for comparision and sorting
  let i = 0;
  const children: VNode<T>[] = [];
  for (const node of nodes) {
    children.push(update(node, vChildren[i], globalOptions, false));
    i++;
  }
  return children;
}

export function isEmptyNode(
  node: JSX.Element,
): node is boolean | null | undefined {
  return typeof node === "boolean" || node == null;
}

export function isTextNode(
  value: JSX.Element,
): value is string | number | JSX.SignalLike {
  return (
    value != null &&
    (typeof value === "string" || Number.isFinite(value) || isVSignal(value))
  );
}

export function isFragmentNode(
  node: JSX.Element,
): node is JSX.Element[] | JSX.ComponentNode<0> {
  return (
    (typeof node === "object" && node && "type" in node && node.type === 0) ||
    Array.isArray(node)
  );
}

export function isElementNode(
  node: JSX.Element,
): node is JSX.ComponentNode<string> {
  return (
    (node &&
      typeof node === "object" &&
      "type" in node &&
      typeof node.type === "string") ||
    false
  );
}

export function isComponentNode(
  node: JSX.Element,
): node is JSX.ComponentNode<JSX.Component> {
  return (
    (node &&
      typeof node === "object" &&
      "type" in node &&
      typeof node.type === "function") ||
    false
  );
}

export function isTemplateNode(node: JSX.Element): node is JSX.TemplateNode {
  return (node && typeof node === "object" && "templates" in node) || false;
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

export function isVSignal(node: JSX.Element): node is VSignal {
  return (node && typeof node === "object" && "get" in node) || false;
}

export function cleanup(vNode: VNode<unknown>) {
  if (vNode?.type === VType.COMPONENT) {
    for (const c of vNode[VNodeProps.CLEANUP]) {
      c.cleanup();
    }
    vNode[VNodeProps.CLEANUP] = [];
  }

  if (isVComponent(vNode)) {
    cleanup(vNode[VNodeProps.AST]);
  }

  if (isVFragment(vNode)) {
    for (const vChild of vNode[VNodeProps.CHILDREN] ?? []) {
      cleanup(vChild);
    }
  }

  if (isVElement(vNode) || isVFragment(vNode)) {
    for (const child of vNode[VNodeProps.CHILDREN] ?? []) {
      cleanup(child);
    }
  }
}

export function snapshot<T>(vNode: VNode<T>): VNode<T> {
  if (isVText(vNode)) {
    return {
      ...vNode,
    };
  }
  if (isVElement(vNode)) {
    const copyChildren = vNode[VNodeProps.CHILDREN]?.map((child) =>
      snapshot(child)
    );
    return { ...vNode, [VNodeProps.CHILDREN]: copyChildren };
  }
  if (isVComponent(vNode)) {
    const copyAst = snapshot(vNode[VNodeProps.AST]);
    return { ...vNode, [VNodeProps.AST]: copyAst };
  }
  if (isVFragment(vNode)) {
    const copyChildren = vNode[VNodeProps.CHILDREN]?.map((child) =>
      snapshot(child)
    );
    return {
      ...vNode,
      [VNodeProps.CHILDREN]: copyChildren,
    };
  }
  return vNode;
}

function childrenFrom(
  fragment: JSX.ComponentNode<0> | JSX.Element[],
): JSX.Element {
  // Array based fragment
  if (Array.isArray(fragment)) return fragment;

  // Function based fragment
  return fragment.props.children ?? [];
}

function keyFrom(
  node: JSX.ComponentNode<0> | JSX.Element[] | JSX.TemplateNode,
): string | number | undefined {
  if (Array.isArray(node) || isTemplateNode(node)) return undefined;
  return node.key;
}

function throwIfPromise<T>(
  node: Promise<T> | T,
): T {
  if (node instanceof Promise) {
    throw new Error("Promise not allowed in scoped context");
  }
  return node;
}
