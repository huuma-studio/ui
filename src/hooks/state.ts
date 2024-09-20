import { State } from "../state/state.ts";
import {
  getScope,
  type VBase,
  VMode,
  type HasVMode,
  VNodeProps,
  type HasVOptions,
} from "../ant.ts";

type VNodeWithState<T> = VBase &
  HasVMode &
  HasVOptions & {
    [VNodeProps.OPTIONS]: {
      $?: State<T>[];
    };
  };

interface StateScope<T> {
  vNode: VNodeWithState<T>;
  state: State<T>;
}

const statesCache: StateScope<unknown>[] = [];

export function $<T>(value: T) {
  const scope = getScope();

  if (!scope.length) {
    return new State(value);
  }

  const vNode = <VNodeWithState<T>>scope[scope.length - 1];

  // If state is left in the current VNode return it.
  if (statesCache.length) {
    if (statesCache[statesCache.length - 1].vNode === vNode) {
      const current = <StateScope<T>>statesCache.shift();
      vNode[VNodeProps.OPTIONS]?.$?.push(current.state);
      return current.state;
    }
    // If VNode is different reset the states cache and simply continue.
    statesCache.length = 0;
  }

  // If VNode is created and has state return its state
  if (
    vNode[VNodeProps.MODE] === VMode.Created &&
    vNode[VNodeProps.OPTIONS]?.$?.length
  ) {
    statesCache.push(
      ...(<StateScope<unknown>[]>vNode[VNodeProps.OPTIONS].$.map((state) => ({
        vNode: vNode,
        state,
      }))),
    );

    vNode[VNodeProps.OPTIONS].$ = [];
    const scope: StateScope<T> = <StateScope<T>>statesCache.shift();
    vNode[VNodeProps.OPTIONS].$.push(scope.state);
    return scope.state;
  }

  const state = new State(value);
  vNode[VNodeProps.OPTIONS].$?.length
    ? vNode[VNodeProps.OPTIONS].$.push(state)
    : (vNode[VNodeProps.OPTIONS].$ = [state]);
  return state;
}
