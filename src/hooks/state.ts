import { State } from "../state/mod.ts";
import {
  getVNodeScope,
  type HasVMode,
  type HasVOptions,
  type VBase,
  VMode,
  VNodeProps,
} from "../v-node/mod.ts";

type VNodeWithState<T> =
  & VBase
  & HasVMode
  & HasVOptions
  & {
    [VNodeProps.OPTIONS]: {
      $?: State<T>[];
    };
  };

interface StateScope<T> {
  vNode: VNodeWithState<T>;
  state: State<T>;
}

// TODO: Move to the global_options of the vNode
const statesCache: StateScope<unknown>[] = [];

export const $ = $signal;
export function $signal<T>(value: T): State<T> {
  const vNodeScope = getVNodeScope();

  if (!vNodeScope.length) {
    return new State(value);
  }

  const vNode = <VNodeWithState<T>> vNodeScope[vNodeScope.length - 1];

  // If state is left in the current VNode return it.
  if (statesCache.length) {
    if (statesCache[statesCache.length - 1].vNode === vNode) {
      const current = <StateScope<T>> statesCache.shift();
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
      ...(<StateScope<unknown>[]> vNode[VNodeProps.OPTIONS].$.map((state) => ({
        vNode: vNode,
        state,
      }))),
    );

    vNode[VNodeProps.OPTIONS].$ = [];
    const scope: StateScope<T> = <StateScope<T>> statesCache.shift();
    vNode[VNodeProps.OPTIONS].$.push(scope.state);
    return scope.state;
  }

  const state = new State(value);
  vNode[VNodeProps.OPTIONS].$?.length
    ? vNode[VNodeProps.OPTIONS].$.push(state)
    : (vNode[VNodeProps.OPTIONS].$ = [state]);
  return state;
}
