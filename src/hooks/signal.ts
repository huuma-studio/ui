import {
  computed,
  type ComputedSignal,
  effect,
  type Signal,
  signal,
  type WritableSignal,
} from "../signal/mod.ts";
import {
  getVNodeScope,
  type HasVMode,
  type HasVOptions,
  type VBase,
  VHook,
  VMode,
  VNodeProps,
} from "../v-node/mod.ts";
import { addHookVComponent } from "./lifecycle.ts";

type VNodeWithSignal<T> =
  & VBase
  & HasVMode
  & HasVOptions
  & {
    [VNodeProps.OPTIONS]: {
      $?: Signal<T>[];
    };
  };

interface SignalScope<T> {
  vNode: VNodeWithSignal<T>;
  signal: Signal<T>;
}

const signalCache: SignalScope<unknown>[] = [];

export function $signal<T>(value: T): WritableSignal<T> {
  return <WritableSignal<T>> signalFromScope<T>(value, signal);
}

export function $computed<T>(value: () => T): Signal<T> {
  return signalFromScope<T>(value, computed);
}

function signalFromScope<T>(
  value: T,
  signalCreator: (value: T) => WritableSignal<T>,
): WritableSignal<T>;
function signalFromScope<T>(
  value: () => T,
  signalCreator: (value: () => T) => ComputedSignal<T>,
): ComputedSignal<T>;
function signalFromScope<T>(
  value: T | (() => T),
  signalCreator: ((value: T) => Signal<T>) | ((value: () => T) => Signal<T>),
): Signal<T> {
  const vNodeScope = getVNodeScope();

  if (!vNodeScope.length) {
    return createSignal(value, signalCreator);
  }

  const vNode = <VNodeWithSignal<T>> vNodeScope[vNodeScope.length - 1];

  // If signal is left in the current VNode return it.
  if (signalCache.length) {
    if (signalCache[signalCache.length - 1].vNode === vNode) {
      const current = <SignalScope<T>> signalCache.shift();
      vNode[VNodeProps.OPTIONS]?.$?.push(current.signal);
      return current.signal;
    }
    // If VNode is different reset the signals cache and simply continue.
    signalCache.length = 0;
  }

  // If VNode is created and has signals return its signals
  if (
    vNode[VNodeProps.MODE] === VMode.Created &&
    vNode[VNodeProps.OPTIONS]?.$?.length
  ) {
    signalCache.push(
      ...(<SignalScope<unknown>[]> vNode[VNodeProps.OPTIONS].$.map((
        signal,
      ) => ({
        vNode: vNode,
        signal,
      }))),
    );

    vNode[VNodeProps.OPTIONS].$ = [];
    const scope: SignalScope<T> = <SignalScope<T>> signalCache.shift();
    vNode[VNodeProps.OPTIONS].$.push(scope.signal);
    return scope.signal;
  }

  const signal = createSignal(value, signalCreator);
  vNode[VNodeProps.OPTIONS].$?.length
    ? vNode[VNodeProps.OPTIONS].$.push(signal)
    : (vNode[VNodeProps.OPTIONS].$ = [signal]);
  return signal;
}

function createSignal<T>(
  value: T | (() => T),
  signalCreator: ((value: T) => Signal<T>) | ((value: () => T) => Signal<T>),
) {
  if (typeof value === "function" && signalCreator === computed) {
    return (<typeof computed> signalCreator)(value as () => T);
  }
  if (signalCreator === signal) {
    return (<typeof signal> signalCreator)(value as T);
  }
  throw new Error("Invalid signal creator");
}

export function $effect(fn: () => void): void {
  addHookVComponent(() => effect(fn), VHook.MOUNT);
}
