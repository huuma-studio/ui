import { assert, describe, expect, test } from "vite-plus/test";
import { type Cleanup, computed, setSubscriber, signal } from "./mod.ts";

describe(setSubscriber.name, () => {
  test("subscribe reads inside the callback", () => {
    const count = signal(0);
    const updates: number[] = [];

    setSubscriber(() => count.get(), {
      update: (value: number) => updates.push(value),
    });

    count.set(1);
    expect(updates).toStrictEqual([1]);
  });

  test("pop the subscriber scope when the callback throws", () => {
    const count = signal(0);
    const updates: number[] = [];

    assert.throws(
      () =>
        setSubscriber(
          (): void => {
            throw new Error("render failed");
          },
          { update: (value: number) => updates.push(value) },
        ),
      Error,
      "render failed",
    );

    // The stale scope must not leak out of the failed call: this get()
    // runs outside any subscriber scope and must not subscribe.
    count.get();
    count.set(1);
    expect(updates).toStrictEqual([]);
  });

  test("restore the outer scope after a nested callback throws", () => {
    const count = signal(0);
    const outerUpdates: number[] = [];

    setSubscriber(
      () => {
        assert.throws(
          () =>
            setSubscriber(
              (): void => {
                throw new Error("inner failed");
              },
              { update: () => {} },
            ),
          Error,
          "inner failed",
        );

        // The outer scope must be active again after the failed nested call.
        count.get();
      },
      { update: (value: number) => outerUpdates.push(value) },
    );

    count.set(1);
    expect(outerUpdates).toStrictEqual([1]);
  });
});

describe("notify", () => {
  test("update a subscriber when its computed stays unchanged", () => {
    const count = signal(1);
    const isOdd = computed(() => count.get() % 2 === 1);
    const updates: number[] = [];

    setSubscriber(
      () => {
        count.get();
        isOdd.get();
      },
      { update: () => updates.push(count.get()) },
    );

    // isOdd stays true: only the direct dependency reaches the subscriber.
    count.set(3);
    expect(updates).toStrictEqual([3]);
  });

  test("update a subscriber once when its computed changes", () => {
    const count = signal(1);
    const isOdd = computed(() => count.get() % 2 === 1);
    const updates: [number, boolean][] = [];

    setSubscriber(
      () => {
        count.get();
        isOdd.get();
      },
      { update: () => updates.push([count.get(), isOdd.get()]) },
    );

    count.set(2);
    expect(updates).toStrictEqual([[2, false]]);
  });

  test("update a subscriber once with settled values of two computed signals", () => {
    const count = signal(1);
    const double = computed(() => count.get() * 2);
    const triple = computed(() => count.get() * 3);
    const withSource: number[][] = [];
    const computedOnly: number[][] = [];

    setSubscriber(
      () => {
        count.get();
        double.get();
        triple.get();
      },
      {
        update: () => withSource.push([count.get(), double.get(), triple.get()]),
      },
    );
    setSubscriber(
      () => {
        double.get();
        triple.get();
      },
      { update: () => computedOnly.push([double.get(), triple.get()]) },
    );

    count.set(2);
    expect(withSource).toStrictEqual([[2, 4, 6]]);
    expect(computedOnly).toStrictEqual([[4, 6]]);
  });

  test("compute once from settled values in a deeper diamond", () => {
    const count = signal(1);
    const next = computed(() => count.get() + 1);
    const tenfold = computed(() => count.get() * 10);
    // One more level on this side of the diamond.
    const tenfoldCopy = computed(() => tenfold.get());
    const seen: number[][] = [];
    const sum = computed(() => {
      seen.push([next.get(), tenfoldCopy.get()]);
      return next.get() + tenfoldCopy.get();
    });
    const values: number[] = [];
    setSubscriber(() => sum.get(), {
      update: (value: number) => values.push(value),
    });

    count.set(2);
    expect(seen).toStrictEqual([
      [2, 10],
      [3, 20],
    ]);
    expect(values).toStrictEqual([23]);
  });

  test("throw no error for values that never settled", () => {
    const count = signal(1);
    const left = computed(() => count.get());
    const right = computed(() => count.get());
    const rightCopy = computed(() => right.get());
    const inSync = computed(() => {
      if (left.get() !== rightCopy.get()) throw new Error("out of sync");
      return left.get();
    });
    const values: number[] = [];
    setSubscriber(() => inSync.get(), {
      update: (value: number) => values.push(value),
    });

    count.set(2);
    expect(values).toStrictEqual([2]);
  });

  test("pass the computed value to its subscriber", () => {
    const count = signal(1);
    const double = computed(() => count.get() * 2);
    const values: number[] = [];

    setSubscriber(() => double.get(), {
      update: (value: number) => values.push(value),
    });

    count.set(5);
    expect(values).toStrictEqual([10]);
  });

  test("skip a scope unsubscribed earlier in the same pass", () => {
    const count = signal(0);
    const cleanups: Cleanup[] = [];
    const updates: string[] = [];

    // The first subscriber tears down the second, like a parent component
    // re-render cleaning up its child's subscription.
    setSubscriber(() => count.get(), {
      update: () => {
        updates.push("first");
        cleanups.forEach((cleanup) => cleanup.cleanup());
      },
    });
    setSubscriber(() => count.get(), {
      update: () => updates.push("second"),
      cleanupCallback: (cleanup) => cleanups.push(cleanup),
    });

    count.set(1);
    expect(updates).toStrictEqual(["first"]);
  });

  test("skip a source unsubscribed earlier in the same pass", () => {
    const a = signal(0);
    const b = signal(0);
    const cleanups = new Map<unknown, Cleanup>();
    const values: number[] = [];

    // Cancels only the second scope's subscription to a: it still
    // subscribes to b, but a must no longer reach it.
    setSubscriber(() => a.get(), {
      update: () => cleanups.get(a)?.cleanup(),
    });
    setSubscriber(
      () => {
        a.get();
        b.get();
      },
      {
        update: (value: number) => values.push(value),
        cleanupCallback: (cleanup) => cleanups.set(cleanup.signal, cleanup),
      },
    );

    a.set(1);
    expect(values).toStrictEqual([]);

    b.set(2);
    expect(values).toStrictEqual([2]);
  });

  test("deliver through a source that is still subscribed", () => {
    const count = signal(1);
    const cleanups = new Map<unknown, Cleanup>();
    const values: number[] = [];

    // Subscribed before double, so it is queued before the scope below.
    setSubscriber(() => count.get(), {
      update: () => cleanups.get(count)?.cleanup(),
    });
    const double = computed(() => count.get() * 2);
    setSubscriber(
      () => {
        count.get();
        double.get();
      },
      {
        update: (value: number) => values.push(value),
        cleanupCallback: (cleanup) => cleanups.set(cleanup.signal, cleanup),
      },
    );

    count.set(5);
    expect(values).toStrictEqual([10]);
  });

  test("update other subscribers when a computed throws", () => {
    const count = signal(0);
    const updates: number[] = [];

    setSubscriber(() => count.get(), {
      update: (value: number) => updates.push(value),
    });
    computed(() => {
      if (count.get() > 0) throw new Error("computed failed");
      return count.get();
    });
    setSubscriber(() => count.get(), {
      update: (value: number) => updates.push(value * 10),
    });

    assert.throws(() => count.set(1), Error, "computed failed");
    expect(updates).toStrictEqual([1, 10]);
  });

  test("skip everything that reads a failed computed", () => {
    const a = signal(0);
    const b = computed(() => {
      if (a.get() > 0) throw new Error("b failed");
      return a.get();
    });
    const c = computed(() => a.get() + b.get());
    const sums: number[] = [];
    const mixed: number[][] = [];
    const unrelated: number[] = [];

    setSubscriber(() => c.get(), {
      update: (value: number) => sums.push(value),
    });
    setSubscriber(
      () => {
        a.get();
        c.get();
      },
      { update: () => mixed.push([a.get(), c.get()]) },
    );
    setSubscriber(() => a.get(), {
      update: (value: number) => unrelated.push(value),
    });

    assert.throws(() => a.set(1), Error, "b failed");
    expect(c.get()).toStrictEqual(0);
    expect(sums).toStrictEqual([]);
    expect(mixed).toStrictEqual([]);
    expect(unrelated).toStrictEqual([1]);

    // The next successful pass updates the whole chain again.
    a.set(-1);
    expect(sums).toStrictEqual([-2]);
    expect(mixed).toStrictEqual([[-1, -2]]);
    expect(unrelated).toStrictEqual([1, -1]);
  });

  test("recompute skipped work once the failure clears", () => {
    const a = signal(0);
    const b = computed(() => {
      if (a.get() === 1) throw new Error("b failed");
      return 0;
    });
    const e = computed(() => Math.min(a.get(), 1));
    const c = computed(() => b.get() + e.get());
    const values: number[] = [];
    setSubscriber(() => c.get(), {
      update: (value: number) => values.push(value),
    });

    assert.throws(() => a.set(1), Error, "b failed");
    expect(c.get()).toStrictEqual(0);

    // b recovers with its old value and e stays unchanged: neither changes,
    // but c was skipped and must catch up.
    a.set(2);
    expect(c.get()).toStrictEqual(1);
    expect(values).toStrictEqual([1]);
  });

  test("run a skipped subscriber once the failure clears", () => {
    const a = signal(0);
    const broken = signal(false);
    const zero = computed(() => {
      if (broken.get()) throw new Error("zero failed");
      return a.get() - a.get();
    });
    const seen: number[] = [];
    setSubscriber(
      () => {
        a.get();
        zero.get();
      },
      { update: () => seen.push(a.get()) },
    );

    assert.throws(() => broken.set(true), Error, "zero failed");
    assert.throws(() => a.set(1), Error, "zero failed");
    expect(seen).toStrictEqual([]);

    // zero recovers unchanged, but the subscriber missed a = 1.
    broken.set(false);
    expect(seen).toStrictEqual([1]);
  });

  test("run every subscriber and rethrow all errors", () => {
    const count = signal(0);
    const updates: string[] = [];

    for (const name of ["first", "second", "third"]) {
      setSubscriber(() => count.get(), {
        update: () => {
          updates.push(name);
          if (name !== "second") throw new Error(name);
        },
      });
    }

    let error: unknown;
    try {
      count.set(1);
    } catch (thrown) {
      error = thrown;
    }
    assert(error instanceof AggregateError);
    expect(updates).toStrictEqual(["first", "second", "third"]);
    expect(error.errors.map((error: Error) => error.message)).toStrictEqual(["first", "third"]);
  });

  test("start a new pass for a set() inside a subscriber", () => {
    const a = signal(0);
    const b = signal(0);
    const bIsPositive = computed(() => b.get() >= 0);
    const seen: number[] = [];

    // Updated in a's pass, and deferred in b's pass behind bIsPositive.
    setSubscriber(
      () => {
        a.get();
        b.get();
        bIsPositive.get();
      },
      { update: () => seen.push(b.get()) },
    );
    setSubscriber(() => a.get(), {
      update: (value: number) => b.set(value * 10),
    });

    a.set(1);
    expect(seen).toStrictEqual([0, 10]);
  });
});
