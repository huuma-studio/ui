import { type Signal, untracked, WritableSignal } from "../signal/mod.ts";

type StateInit<T extends Record<string, unknown>> = (set: (state: Partial<T>) => void) => T;

export function createStore<T extends Record<string, unknown>>(
  init: StateInit<T>,
  options?: {
    persist?: boolean;
    key?: string;
  },
): Signal<T> {
  let storedState: T | null = null;
  // There is no localStorage on a server, and a browser may decline
  // access: the store runs without it all the same.
  if (options?.key && options?.persist && typeof localStorage !== "undefined") {
    try {
      const retrievedState = localStorage.getItem(options.key);
      if (retrievedState !== null) {
        const parsed: unknown = JSON.parse(retrievedState);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          storedState = parsed as T;
        }
      }
    } catch {
      // Corrupted or unreadable stored state: start from the setup state.
      storedState = null;
    }
  }

  // The signal exists before init runs, so init may set state right away.
  const signal = new WritableSignal<T>({} as T);

  const set = (state: Partial<T>) => {
    signal.set({ ...untracked(() => signal.get()), ...state });
    if (options?.persist && options?.key && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(options.key, JSON.stringify(untracked(() => signal.get())));
      } catch {
        // Storage may refuse the write (quota, eviction): the store keeps
        // its state in memory all the same.
      }
    }
  };

  const state = init(set);
  // What init set through set() is newer than the state it returns; what
  // the last visit stored is newer than them both, as before.
  signal.set({ ...state, ...untracked(() => signal.get()), ...storedState });

  return signal;
}
