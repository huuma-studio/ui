import { type Signal, untracked, WritableSignal } from "../signal/mod.ts";

type StateInit<T extends Record<string, unknown>> = (
  set: (state: Partial<T>) => void,
) => T;

export function createStore<T extends Record<string, unknown>>(
  init: StateInit<T>,
  options?: {
    persist?: boolean;
    key?: string;
  },
): Signal<T> {
  const set = (state: Partial<T>) => {
    const newState = { ...untracked(() => signal.get()), ...state };
    if (options?.persist && options?.key) {
      localStorage.setItem(options.key, JSON.stringify(newState));
    }
    signal.set(newState);
  };

  let storedState: T | null = null;
  if (options?.key && options?.persist) {
    const retrievedState = localStorage.getItem(options.key);
    if (retrievedState !== null) {
      storedState = JSON.parse(retrievedState);
    }
  }

  const state = init(set);
  const signal = new WritableSignal({ ...state, ...(storedState || {}) });
  return signal;
}
