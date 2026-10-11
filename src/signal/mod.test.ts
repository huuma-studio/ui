import { assertEquals, assertThrows } from "@std/assert";
import { type Cleanup, computed, setSubscriber, signal } from "./mod.ts";

Deno.test(setSubscriber.name, async (t) => {
  await t.step("subscribe reads inside the callback", () => {
    const count = signal(0);
    const updates: number[] = [];

    setSubscriber(() => count.get(), {
      update: (value: number) => updates.push(value),
    });

    count.set(1);
    assertEquals(updates, [1]);
  });

  await t.step("pop the subscriber scope when the callback throws", () => {
    const count = signal(0);
    const updates: number[] = [];

    assertThrows(
      () =>
        setSubscriber((): void => {
          throw new Error("render failed");
        }, { update: (value: number) => updates.push(value) }),
      Error,
      "render failed",
    );

    // The stale scope must not leak out of the failed call: this get()
    // runs outside any subscriber scope and must not subscribe.
    count.get();
    count.set(1);
    assertEquals(updates, []);
  });

  await t.step("restore the outer scope after a nested callback throws", () => {
    const count = signal(0);
    const outerUpdates: number[] = [];

    setSubscriber(() => {
      assertThrows(
        () =>
          setSubscriber((): void => {
            throw new Error("inner failed");
          }, { update: () => {} }),
        Error,
        "inner failed",
      );

      // The outer scope must be active again after the failed nested call.
      count.get();
    }, { update: (value: number) => outerUpdates.push(value) });

    count.set(1);
    assertEquals(outerUpdates, [1]);
  });
});

Deno.test("notify", async (t) => {
  await t.step("update a subscriber when its computed stays unchanged", () => {
    const count = signal(1);
    const isOdd = computed(() => count.get() % 2 === 1);
    const updates: number[] = [];

    setSubscriber(() => {
      count.get();
      isOdd.get();
    }, { update: () => updates.push(count.get()) });

    // isOdd stays true: only the direct dependency reaches the subscriber.
    count.set(3);
    assertEquals(updates, [3]);
  });

  await t.step("update a subscriber once when its computed changes", () => {
    const count = signal(1);
    const isOdd = computed(() => count.get() % 2 === 1);
    const updates: [number, boolean][] = [];

    setSubscriber(() => {
      count.get();
      isOdd.get();
    }, { update: () => updates.push([count.get(), isOdd.get()]) });

    count.set(2);
    assertEquals(updates, [[2, false]]);
  });

  await t.step(
    "update a subscriber once with settled values of two computed signals",
    () => {
      const count = signal(1);
      const double = computed(() => count.get() * 2);
      const triple = computed(() => count.get() * 3);
      const withSource: number[][] = [];
      const computedOnly: number[][] = [];

      setSubscriber(() => {
        count.get();
        double.get();
        triple.get();
      }, {
        update: () =>
          withSource.push([count.get(), double.get(), triple.get()]),
      });
      setSubscriber(() => {
        double.get();
        triple.get();
      }, { update: () => computedOnly.push([double.get(), triple.get()]) });

      count.set(2);
      assertEquals(withSource, [[2, 4, 6]]);
      assertEquals(computedOnly, [[4, 6]]);
    },
  );

  await t.step("compute once from settled values in a deeper diamond", () => {
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
    assertEquals(seen, [[2, 10], [3, 20]]);
    assertEquals(values, [23]);
  });

  await t.step("throw no error for values that never settled", () => {
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
    assertEquals(values, [2]);
  });

  await t.step("pass the computed value to its subscriber", () => {
    const count = signal(1);
    const double = computed(() => count.get() * 2);
    const values: number[] = [];

    setSubscriber(() => double.get(), {
      update: (value: number) => values.push(value),
    });

    count.set(5);
    assertEquals(values, [10]);
  });

  await t.step("skip a scope unsubscribed earlier in the same pass", () => {
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
    assertEquals(updates, ["first"]);
  });

  await t.step("skip a source unsubscribed earlier in the same pass", () => {
    const a = signal(0);
    const b = signal(0);
    const cleanups = new Map<unknown, Cleanup>();
    const values: number[] = [];

    // Cancels only the second scope's subscription to a: it still
    // subscribes to b, but a must no longer reach it.
    setSubscriber(() => a.get(), {
      update: () => cleanups.get(a)?.cleanup(),
    });
    setSubscriber(() => {
      a.get();
      b.get();
    }, {
      update: (value: number) => values.push(value),
      cleanupCallback: (cleanup) => cleanups.set(cleanup.signal, cleanup),
    });

    a.set(1);
    assertEquals(values, []);

    b.set(2);
    assertEquals(values, [2]);
  });

  await t.step("deliver through a source that is still subscribed", () => {
    const count = signal(1);
    const cleanups = new Map<unknown, Cleanup>();
    const values: number[] = [];

    // Subscribed before double, so it is queued before the scope below.
    setSubscriber(() => count.get(), {
      update: () => cleanups.get(count)?.cleanup(),
    });
    const double = computed(() => count.get() * 2);
    setSubscriber(() => {
      count.get();
      double.get();
    }, {
      update: (value: number) => values.push(value),
      cleanupCallback: (cleanup) => cleanups.set(cleanup.signal, cleanup),
    });

    count.set(5);
    assertEquals(values, [10]);
  });

  await t.step("update other subscribers when a computed throws", () => {
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

    assertThrows(() => count.set(1), Error, "computed failed");
    assertEquals(updates, [1, 10]);
  });

  await t.step("skip everything that reads a failed computed", () => {
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
    setSubscriber(() => {
      a.get();
      c.get();
    }, { update: () => mixed.push([a.get(), c.get()]) });
    setSubscriber(() => a.get(), {
      update: (value: number) => unrelated.push(value),
    });

    assertThrows(() => a.set(1), Error, "b failed");
    assertEquals(c.get(), 0);
    assertEquals(sums, []);
    assertEquals(mixed, []);
    assertEquals(unrelated, [1]);

    // The next successful pass updates the whole chain again.
    a.set(-1);
    assertEquals(sums, [-2]);
    assertEquals(mixed, [[-1, -2]]);
    assertEquals(unrelated, [1, -1]);
  });

  await t.step("recompute skipped work once the failure clears", () => {
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

    assertThrows(() => a.set(1), Error, "b failed");
    assertEquals(c.get(), 0);

    // b recovers with its old value and e stays unchanged: neither changes,
    // but c was skipped and must catch up.
    a.set(2);
    assertEquals(c.get(), 1);
    assertEquals(values, [1]);
  });

  await t.step("run a skipped subscriber once the failure clears", () => {
    const a = signal(0);
    const broken = signal(false);
    const zero = computed(() => {
      if (broken.get()) throw new Error("zero failed");
      return a.get() - a.get();
    });
    const seen: number[] = [];
    setSubscriber(() => {
      a.get();
      zero.get();
    }, { update: () => seen.push(a.get()) });

    assertThrows(() => broken.set(true), Error, "zero failed");
    assertThrows(() => a.set(1), Error, "zero failed");
    assertEquals(seen, []);

    // zero recovers unchanged, but the subscriber missed a = 1.
    broken.set(false);
    assertEquals(seen, [1]);
  });

  await t.step("run every subscriber and rethrow all errors", () => {
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

    const error = assertThrows(() => count.set(1), AggregateError);
    assertEquals(updates, ["first", "second", "third"]);
    assertEquals(
      error.errors.map((error: Error) => error.message),
      ["first", "third"],
    );
  });

  await t.step("start a new pass for a set() inside a subscriber", () => {
    const a = signal(0);
    const b = signal(0);
    const bIsPositive = computed(() => b.get() >= 0);
    const seen: number[] = [];

    // Updated in a's pass, and deferred in b's pass behind bIsPositive.
    setSubscriber(() => {
      a.get();
      b.get();
      bIsPositive.get();
    }, { update: () => seen.push(b.get()) });
    setSubscriber(() => a.get(), {
      update: (value: number) => b.set(value * 10),
    });

    a.set(1);
    assertEquals(seen, [0, 10]);
  });
});
