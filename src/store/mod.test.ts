// @vitest-environment happy-dom
import { describe, expect, test } from "vite-plus/test";

import { createStore } from "./mod.ts";

describe("createStore", () => {
  test("the state init returns is the store's state", () => {
    const store = createStore(() => ({ count: 0 }));

    expect(store.get()).toEqual({ count: 0 });
  });

  test("init may set state right away", () => {
    const store = createStore((set) => {
      set({ count: 1 });
      return { count: 0 };
    });

    expect(store.get()).toEqual({ count: 1 });
  });

  test("a set by init accumulates over the state it returns", () => {
    const store = createStore((set) => {
      set({ count: 1 });
      set({ name: "a" });
      return { count: 0, name: "", done: false };
    });

    expect(store.get()).toEqual({ count: 1, name: "a", done: false });
  });

  test("the stored state overrides the setup state", () => {
    const key = "create-store-test";
    localStorage.setItem(key, JSON.stringify({ count: 7 }));

    const store = createStore(() => ({ count: 0 }), { persist: true, key });

    expect(store.get()).toEqual({ count: 7 });
    localStorage.removeItem(key);
  });

  test("the stored state is written on set", () => {
    const key = "create-store-test";
    let set: (state: Partial<{ count: number }>) => void;
    createStore(
      (initSet) => {
        set = initSet;
        return { count: 0 };
      },
      { persist: true, key },
    );

    set!({ count: 2 });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ count: 2 });
    localStorage.removeItem(key);
  });

  test("corrupted stored state is ignored", () => {
    const key = "create-store-test";
    localStorage.setItem(key, "{not json");

    const store = createStore(() => ({ count: 0 }), { persist: true, key });

    expect(store.get()).toEqual({ count: 0 });
    expect(store.get().count).toBe(0);
    localStorage.removeItem(key);
  });

  test("a missing storage doesn't break the store", () => {
    const key = "create-store-test";
    const backup = globalThis.localStorage;
    Reflect.deleteProperty(globalThis, "localStorage");

    let set: (state: Partial<{ count: number }>) => void;
    try {
      expect("localStorage" in globalThis).toBe(false);
      const store = createStore(
        (initSet) => {
          set = initSet;
          return { count: 0 };
        },
        { persist: true, key },
      );
      // The state init returns, and the sets through it, work without
      // storage.
      expect(store.get()).toEqual({ count: 0 });
      set!({ count: 1 });
      expect(store.get()).toEqual({ count: 1 });
    } finally {
      globalThis.localStorage = backup;
    }
  });
});
