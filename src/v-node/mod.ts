import type { JSX } from "../jsx-runtime/mod.ts";
import type { Cleanup } from "../signal/mod.ts";

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

export type VNodeBeforeCreateVisitor = (
  jsx: JSX.Element,
) => JSX.Element;

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

export function vText<T>(
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
  node: unknown,
): node is JSX.Element[] | JSX.ComponentNode<0> {
  return (
    (typeof node === "object" && node && "type" in node && node.type === 0) ||
    isArray(node)
  );
}

export function isElementNode(
  node: unknown,
): node is JSX.ComponentNode<string> {
  return (
    (
      typeof node === "object" &&
      node &&
      "type" in node &&
      typeof node.type === "string"
    ) ||
    false
  );
}

export function isComponentNode(
  node: unknown,
): node is JSX.ComponentNode<JSX.Component> {
  return (
    (
      typeof node === "object" &&
      node &&
      "type" in node &&
      typeof node.type === "function"
    ) ||
    false
  );
}

export function isTemplateNode(
  node: unknown,
): node is JSX.TemplateNode {
  return (typeof node === "object" && node && "templates" in node) || false;
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
  if (isVComponent(vNode)) {
    for (const c of vNode[VNodeProps.CLEANUP]) {
      c.cleanup();
    }
    vNode[VNodeProps.CLEANUP] = [];
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

export function childrenFrom(
  fragment: JSX.ComponentNode<0> | JSX.Element[],
): JSX.Element {
  // Array based fragment
  if (isArray(fragment)) return fragment;

  // Function based fragment
  return fragment.props.children ?? [];
}

export function keyFromNode(
  node:
    | JSX.Element[]
    | JSX.Element,
): string | number | undefined {
  if (isArray(node) || isTemplateNode(node) && !node) return undefined;

  if (isFragmentNode(node) || isComponentNode(node) || isElementNode(node)) {
    return node.key;
  }
}

export function keyFromVNode<T>(vNode: VNode<T>): string | number | undefined {
  if (!vNode || isVText(vNode)) {
    return undefined;
  }
  return vNode[VNodeProps.KEY];
}

// TODO: Move to a the appropiate location (maybe @huuma/validate)
// deno-lint-ignore no-explicit-any
export function isArray(value: any): value is any[] {
  return Array.isArray(value);
}
