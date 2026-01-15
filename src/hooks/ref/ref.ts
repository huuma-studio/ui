import { type Ref, ref } from "../../ref/mod.ts";
import { $scope } from "../scope.ts";
import {
  type HasVMode,
  type HasVOptions,
  type VBase,
  VMode,
  VNodeProps,
} from "../../v-node/mod.ts";
import {
  computed,
  type ComputedSignal,
  type Signal,
  signal,
  type WritableSignal,
} from "../../signal/mod.ts";

type VNodeWithRef<T> =
  & VBase
  & HasVMode
  & HasVOptions
  & {
    [VNodeProps.OPTIONS]: {
      $?: (Signal<T> | Ref<T>)[];
    };
  };

interface RefScope<T> {
  vNode: VNodeWithRef<T>;
  ref: Ref<T> | Signal<T>;
}

const refCache: RefScope<unknown>[] = [];

export function refFromScope<T>(
  value: T,
  refCreator: (value: T) => Ref<T>,
): Ref<T>;
export function refFromScope<T>(
  value: T,
  refCreator: (value: T) => WritableSignal<T>,
): WritableSignal<T>;
export function refFromScope<T>(
  value: () => T,
  refCreator: (value: () => T) => ComputedSignal<T>,
): ComputedSignal<T>;
export function refFromScope<T>(
  value: T | (() => T),
  refCreator:
    | ((value: T) => Ref<T>)
    | ((value: T) => Signal<T>)
    | ((value: () => T) => Signal<T>),
): Ref<T> | Signal<T> {
  const scope = $scope();

  if (!scope) {
    return createRef(value, refCreator);
  }

  const vNode = <VNodeWithRef<T>> scope;

  // If signal is left in the current VNode return it.
  if (refCache.length) {
    if (refCache[refCache.length - 1].vNode === vNode) {
      const current = <RefScope<T>> refCache.shift();
      vNode[VNodeProps.OPTIONS]?.$?.push(current.ref);
      return current.ref;
    }
    // If VNode is different reset the signals cache and simply continue.
    refCache.length = 0;
  }

  // If VNode is created and has signals return its signals
  if (
    vNode[VNodeProps.MODE] !== VMode.NotCreated &&
    vNode[VNodeProps.OPTIONS]?.$?.length
  ) {
    refCache.push(
      ...(<RefScope<unknown>[]> vNode[VNodeProps.OPTIONS].$.map((
        ref,
      ) => ({
        vNode: vNode,
        ref,
      }))),
    );

    vNode[VNodeProps.OPTIONS].$ = [];
    const scope: RefScope<T> = <RefScope<T>> refCache.shift();
    vNode[VNodeProps.OPTIONS].$.push(scope.ref);
    return scope.ref;
  }

  const signal = createRef(value, refCreator);
  vNode[VNodeProps.OPTIONS].$?.length
    ? vNode[VNodeProps.OPTIONS].$.push(signal)
    : (vNode[VNodeProps.OPTIONS].$ = [signal]);
  return signal;
}

function createRef<T>(
  value: T | (() => T),
  refCreator:
    | ((value: T) => Ref<T>)
    | ((value: T) => Signal<T>)
    | ((value: () => T) => Signal<T>),
): ComputedSignal<T> | Ref<T> | WritableSignal<T> {
  if (typeof value === "function" && refCreator === computed) {
    return (<typeof computed> refCreator)(value as () => T);
  }

  if (refCreator === ref) {
    return (<typeof ref> refCreator)(value as T);
  }

  if (refCreator === signal) {
    return (<typeof signal> refCreator)(value as T);
  }
  throw new Error("Invalid ref creator");
}
