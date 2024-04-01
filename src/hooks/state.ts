import { State } from "../state/state.ts";

import { scope, VComponent, VMode } from "../ast.ts";

interface VComponentWithState<T> extends VComponent<unknown> {
  state?: State<T>[];
}

interface StateScope<T> {
  component: VComponentWithState<unknown>;
  state: State<T>;
}

const statesCache: StateScope<unknown>[] = [];

export function $<T>(value: T) {
  if (!scope.length) {
    return new State(value);
  }

  const vComponent: VComponentWithState<T> = scope[scope.length - 1];

  // If state is left in the current VComponent return it.
  if (statesCache.length) {
    if (statesCache[statesCache.length - 1].component === vComponent) {
      const current = <StateScope<T>> statesCache.shift();
      vComponent.state?.push(current.state);
      return current.state;
    }
    // If VComponent has different id reset the state cache
    statesCache.length = 0;
  }

  // If VComponent is created and has state return VComponent state
  if (vComponent.mode === VMode.Created && vComponent.state?.length) {
    statesCache.push(
      ...<StateScope<unknown>[]> vComponent.state.map((state) => ({
        component: vComponent,
        state,
      })),
    );
    vComponent.state = [];
    const current: StateScope<T> = <StateScope<T>> statesCache.shift();
    vComponent.state.push(current.state);
    return current.state;
  }

  const state = new State(value);
  Array.isArray(vComponent.state)
    ? vComponent.state.push(state)
    : vComponent.state = [state];

  return state;
}
