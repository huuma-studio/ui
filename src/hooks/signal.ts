import { Signal } from "../signal/mod.ts";
import {
  getVNodeScope,
  type HasVMode,
  type HasVOptions,
  type VBase,
  VMode,
  VNodeProps,
} from "../v-node/mod.ts";

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

// TODO: Move to the global_options of the vNode
const signalCache: SignalScope<unknown>[] = [];

export function $signal<T>(value: T): Signal<T> {
  const vNodeScope = getVNodeScope();

  if (!vNodeScope.length) {
    return new Signal(value);
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

  const signal = new Signal(value);
  vNode[VNodeProps.OPTIONS].$?.length
    ? vNode[VNodeProps.OPTIONS].$.push(signal)
    : (vNode[VNodeProps.OPTIONS].$ = [signal]);
  return signal;
}
