import { assert, describe, expect, test } from "vite-plus/test";
import { batch, type Cleanup, computed, effect, setSubscriber, signal } from "./mod.ts";

describe("computed dependencies that change", () => {
  test("follows a newly selected source and can switch back", () => {
    const left = signal(1);
    const right = signal(10);
    const useLeft = signal(true);
    const selected = computed(() => (useLeft.get() ? left.get() : right.get()));
    const values: number[] = [];
    setSubscriber(() => selected.get(), { update: (value: number) => values.push(value) });

    useLeft.set(false);
    right.set(20);
    expect(selected.get()).toBe(20);
    expect(values).toStrictEqual([10, 20]);

    useLeft.set(true);
    left.set(2);
    expect(selected.get()).toBe(2);
    expect(values).toStrictEqual([10, 20, 1, 2]);
  });

  test("unsubscribes from an inactive branch", () => {
    const left = signal(1);
    const right = signal(10);
    const useLeft = signal(true);
    let calls = 0;
    const selected = computed(() => {
      calls++;
      return useLeft.get() ? left.get() : right.get();
    });
    useLeft.set(false);
    const before = calls;

    left.set(2);
    expect(selected.get()).toBe(10);
    expect(calls).toBe(before);
  });

  test("switches dependencies even when the computed value stays equal", () => {
    const left = signal(1);
    const right = signal(1);
    const useLeft = signal(true);
    const selected = computed(() => (useLeft.get() ? left.get() : right.get()));
    const values: number[] = [];
    setSubscriber(() => selected.get(), { update: (value: number) => values.push(value) });

    useLeft.set(false);
    expect(values).toStrictEqual([]);
    right.set(2);
    expect(selected.get()).toBe(2);
    expect(values).toStrictEqual([2]);
  });

  test("updates a downstream computed once with the new branch's settled value", () => {
    const left = signal(1);
    const right = signal(10);
    const useLeft = signal(true);
    const selected = computed(() => (useLeft.get() ? left.get() : right.get()));
    const doubled = computed(() => selected.get() * 2);
    const values: number[][] = [];
    setSubscriber(
      () => {
        selected.get();
        doubled.get();
      },
      { update: () => values.push([selected.get(), doubled.get()]) },
    );

    useLeft.set(false);
    right.set(20);
    expect(values).toStrictEqual([
      [10, 20],
      [20, 40],
    ]);
  });
});

describe("computed dependencies that change, in one pass", () => {
  test("settles a computed it reads for the first time, created after it", () => {
    const count = signal(1);
    // Reads tenfold only from count = 2, and was created before it.
    const reader = computed(() => (count.get() > 1 ? tenfold.get() : -1));
    const tenfold = computed(() => count.get() * 10);

    count.set(2);
    expect(reader.get()).toBe(20);
  });

  test("settles the sources of a computed created after it first", () => {
    const visible = signal(false);
    const count = signal(1);
    const reader = computed(() => (visible.get() ? tenfold.get() : -1));
    const tenfold = computed(() => count.get() * 10);
    const values: number[] = [];
    setSubscriber(() => reader.get(), { update: (value: number) => values.push(value) });

    visible.set(true);
    count.set(2);
    expect(values).toStrictEqual([10, 20]);
  });

  test("disposes a computed from the signals it read in a later run", () => {
    const visible = signal(false);
    const name = signal("Ada");
    let runs = 0;
    const label = computed(() => {
      runs++;
      return visible.get() ? name.get() : "hidden";
    });
    visible.set(true);
    label.dispose();
    const before = runs;

    name.set("Grace");
    visible.set(false);
    expect(runs).toBe(before);
    expect(label.get()).toBe("Ada");
  });
});

describe("effect dependencies that change", () => {
  test("tracks a signal it reads first in a later run", () => {
    const visible = signal(false);
    const name = signal("Ada");
    const seen: string[] = [];
    effect(() => {
      seen.push(visible.get() ? name.get() : "hidden");
    });

    visible.set(true);
    name.set("Grace");
    expect(seen).toStrictEqual(["hidden", "Ada", "Grace"]);
  });

  test("keeps the subscriptions of a run that throws", () => {
    const broken = signal(false);
    const name = signal("Ada");
    effect(() => {
      if (broken.get()) throw new Error("effect failed");
      name.get();
    });

    // The failed run never reached name.get(): it still runs on name.
    assert.throws(() => broken.set(true), Error, "effect failed");
    assert.throws(() => name.set("Grace"), Error, "effect failed");
  });

  test("keeps tracking after a run inside itself, when it sets a signal it reads", () => {
    const a = signal(0);
    const b = signal(0);
    const c = signal(0);
    let runs = 0;
    effect(() => {
      runs++;
      if (a.get() === 1 && b.get() === 0) b.set(1);
      c.get();
    });
    a.set(1);
    const before = runs;

    c.set(1);
    expect(runs).toBe(before + 1);
  });

  test("keeps what a run inside itself read, which saw the newer values", () => {
    const a = signal(0);
    const b = signal(0);
    const c = signal(0);
    const d = signal(0);
    let runs = 0;
    effect(() => {
      runs++;
      const first = a.get();
      const second = b.get();
      if (first === 1 && second === 0) b.set(1);
      // Only the inner run, from b = 1, reads d.
      if (second === 1) d.get();
      c.get();
    });
    a.set(1);
    const before = runs;

    // First: a run from c would read d again.
    d.set(1);
    expect(runs).toBe(before + 1);
  });

  test("disposes from the signals it read in a later run", () => {
    const visible = signal(false);
    const name = signal("Ada");
    const seen: string[] = [];
    const dispose = effect(() => {
      seen.push(visible.get() ? name.get() : "hidden");
    });

    visible.set(true);
    dispose();
    name.set("Grace");
    expect(seen).toStrictEqual(["hidden", "Ada"]);
  });
});

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

describe(batch.name, () => {
  test("runs an effect that reads several signals set in it once", () => {
    const first = signal("Ada");
    const last = signal("Lovelace");
    const seen: string[] = [];
    effect(() => {
      seen.push(`${first.get()} ${last.get()}`);
    });

    batch(() => {
      first.set("Grace");
      expect(seen).toStrictEqual(["Ada Lovelace"]);
      last.set("Hopper");
    });
    expect(seen).toStrictEqual(["Ada Lovelace", "Grace Hopper"]);
  });

  test("recomputes a computed once, and updates what reads it once", () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    const sum = computed(() => {
      runs++;
      return a.get() + b.get();
    });
    const values: number[] = [];
    setSubscriber(() => sum.get(), { update: (value: number) => values.push(value) });
    runs = 0;

    batch(() => {
      a.set(10);
      b.set(20);
    });
    expect(runs).toBe(1);
    expect(values).toStrictEqual([30]);
  });

  test("notifies once about a signal set several times, with its last value", () => {
    const count = signal(0);
    const seen: number[] = [];
    effect(() => {
      seen.push(count.get());
    });

    batch(() => {
      count.set(1);
      count.set(2);
      count.set(3);
    });
    expect(seen).toStrictEqual([0, 3]);
  });

  test("doesn't notify about a signal set back to its value", () => {
    const count = signal(0);
    const other = signal("a");
    const seen: string[] = [];
    effect(() => {
      seen.push(`count ${count.get()}`);
    });
    effect(() => {
      seen.push(`other ${other.get()}`);
    });
    seen.length = 0;

    batch(() => {
      count.set(1);
      other.set("b");
      count.set(0);
    });
    expect(seen).toStrictEqual(["other b"]);
  });

  test("notifies when the outermost batch ends", () => {
    const count = signal(0);
    const seen: number[] = [];
    effect(() => {
      seen.push(count.get());
    });

    batch(() => {
      batch(() => count.set(1));
      expect(seen).toStrictEqual([0]);
      count.set(2);
    });
    expect(seen).toStrictEqual([0, 2]);
  });

  test("returns what the callback returns", () => {
    expect(batch(() => "done")).toBe("done");
  });

  test("reads the new value of a signal and of a computed inside the batch", () => {
    const count = signal(1);
    const double = computed(() => count.get() * 2);
    const quadruple = computed(() => double.get() * 2);

    batch(() => {
      count.set(2);
      expect(count.get()).toBe(2);
      expect(quadruple.get()).toBe(8);
      expect(double.get()).toBe(4);
    });
    expect(quadruple.get()).toBe(8);
  });

  test("runs what reads a computed once, when the batch ends, though the batch read it", () => {
    const count = signal(1);
    const double = computed(() => count.get() * 2);
    const quadruple = computed(() => double.get() * 2);
    const seen: string[] = [];
    effect(() => {
      seen.push(`double ${double.get()}`);
    });
    effect(() => {
      seen.push(`quadruple ${quadruple.get()}`);
    });
    effect(() => {
      seen.push(`count ${count.get()}`);
    });
    seen.length = 0;

    batch(() => {
      count.set(2);
      expect(double.get()).toBe(4);
      expect(seen).toStrictEqual([]);
    });
    expect(seen).toStrictEqual(["double 4", "quadruple 8", "count 2"]);
  });

  test("reads a computed's new value again after another set", () => {
    const count = signal(1);
    const double = computed(() => count.get() * 2);
    const seen: number[] = [];
    effect(() => {
      seen.push(double.get());
    });

    batch(() => {
      count.set(2);
      expect(double.get()).toBe(4);
      count.set(3);
      expect(double.get()).toBe(6);
      count.set(4);
    });
    expect(double.get()).toBe(8);
    expect(seen).toStrictEqual([2, 8]);
  });

  test("puts a computed the batch read back, when its signal is set back", () => {
    const count = signal(1);
    const double = computed(() => count.get() * 2);
    const quadruple = computed(() => double.get() * 2);
    const seen: string[] = [];
    effect(() => {
      seen.push(`double ${double.get()}`);
    });
    effect(() => {
      seen.push(`quadruple ${quadruple.get()}`);
    });
    effect(() => {
      seen.push(`count ${count.get()}`);
    });
    seen.length = 0;

    batch(() => {
      count.set(2);
      expect(quadruple.get()).toBe(8);
      count.set(1);
    });
    expect(double.get()).toBe(2);
    expect(quadruple.get()).toBe(4);
    expect(seen).toStrictEqual([]);
  });

  test("reads a computed set back inside the batch with its value from before", () => {
    const count = signal(1);
    const double = computed(() => count.get() * 2);

    batch(() => {
      count.set(2);
      expect(double.get()).toBe(4);
      count.set(1);
      expect(double.get()).toBe(2);
    });
  });

  test("updates a computed that reads one the batch read, after an unrelated set", () => {
    const count = signal(1);
    const other = signal("a");
    const double = computed(() => count.get() * 2);
    const label = computed(() => `${double.get()}`);

    batch(() => {
      count.set(2);
      expect(double.get()).toBe(4);
      other.set("b");
      expect(label.get()).toBe("4");
    });
  });

  test("recomputes a computed only for a read after a set of a signal it reads", () => {
    const count = signal(1);
    const other = signal(1);
    let runs = 0;
    const double = computed(() => {
      runs++;
      return count.get() * 2;
    });
    let otherRuns = 0;
    const unrelated = computed(() => {
      otherRuns++;
      return other.get();
    });
    runs = 0;
    otherRuns = 0;

    batch(() => {
      double.get();
      expect(runs).toBe(0);
      count.set(2);
      double.get();
      double.get();
      unrelated.get();
      expect(runs).toBe(1);
    });
    expect(otherRuns).toBe(0);
  });

  test("reads a throwing computed's value from before, and throws when the batch ends", () => {
    const count = signal(0);
    const safe = computed(() => {
      if (count.get() === 1) throw new Error("computed failed");
      return count.get();
    });

    assert.throws(
      () =>
        batch(() => {
          count.set(1);
          expect(safe.get()).toBe(0);
        }),
      Error,
      "computed failed",
    );

    // It catches up.
    count.set(2);
    expect(safe.get()).toBe(2);
  });

  test("tracks a signal a computed reads first when the batch reads it", () => {
    const visible = signal(false);
    const name = signal("Ada");
    const label = computed(() => (visible.get() ? name.get() : "hidden"));
    const seen: string[] = [];
    effect(() => {
      seen.push(label.get());
    });

    batch(() => {
      visible.set(true);
      expect(label.get()).toBe("Ada");
      name.set("Grace");
      expect(label.get()).toBe("Grace");
    });
    expect(seen).toStrictEqual(["hidden", "Grace"]);

    name.set("Joan");
    expect(seen).toStrictEqual(["hidden", "Grace", "Joan"]);
  });

  test("puts the subscriptions of a computed back, that the batch read on another branch with an equal value", () => {
    const flag = signal(false);
    const left = signal(1);
    const right = signal(1);
    const selected = computed(() => (flag.get() ? right.get() : left.get()));
    const seen: number[] = [];
    effect(() => {
      seen.push(selected.get());
    });

    batch(() => {
      flag.set(true);
      expect(selected.get()).toBe(1);
      flag.set(false);
    });
    expect(seen).toStrictEqual([1]);

    left.set(2);
    expect(selected.get()).toBe(2);
    expect(seen).toStrictEqual([1, 2]);
  });

  test("reads a chain of computeds anew after a set back and an unrelated set", () => {
    const count = signal(1);
    const other = signal(0);
    const double = computed(() => count.get() * 2);
    const label = computed(() => String(double.get()));

    batch(() => {
      count.set(2);
      expect(label.get()).toBe("4");
      count.set(1);
      expect(double.get()).toBe(2);
      other.set(1);
      expect(label.get()).toBe("2");
    });
    expect(label.get()).toBe("2");
  });

  test("doesn't run a computed again that was disposed after the batch read it", () => {
    const count = signal(1);
    let runs = 0;
    const double = computed(() => {
      runs++;
      return count.get() * 2;
    });
    const seen: number[] = [];
    effect(() => {
      seen.push(double.get());
    });

    batch(() => {
      count.set(2);
      expect(double.get()).toBe(4);
      double.dispose();
    });
    const before = runs;
    // It keeps its last value, and what reads it got it.
    expect(seen).toStrictEqual([2, 4]);

    count.set(3);
    expect(runs).toBe(before);
    expect(double.get()).toBe(4);
  });

  test("doesn't run a disposed computed when the batch reads it", () => {
    const count = signal(1);
    let runs = 0;
    const double = computed(() => {
      runs++;
      return count.get() * 2;
    });

    batch(() => {
      count.set(2);
      double.get();
      double.dispose();
      const before = runs;
      count.set(3);
      expect(double.get()).toBe(4);
      expect(runs).toBe(before);
    });
  });

  test("notifies about the signals a throwing callback set, and ends the batch", () => {
    const count = signal(0);
    const seen: number[] = [];
    effect(() => {
      seen.push(count.get());
    });

    assert.throws(
      () =>
        batch(() => {
          count.set(1);
          throw new Error("callback failed");
        }),
      Error,
      "callback failed",
    );
    expect(seen).toStrictEqual([0, 1]);

    // No longer in a batch.
    count.set(2);
    expect(seen).toStrictEqual([0, 1, 2]);
  });

  test("throws both errors when the callback and a subscriber throw", () => {
    const count = signal(0);
    effect(() => {
      if (count.get() === 1) throw new Error("effect failed");
    });

    let thrown: unknown;
    try {
      batch(() => {
        count.set(1);
        throw new Error("callback failed");
      });
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AggregateError);
    expect(thrown.errors.map((error: Error) => error.message)).toStrictEqual([
      "callback failed",
      "effect failed",
    ]);
  });

  test("throws a subscriber's error, and ends the batch", () => {
    const count = signal(0);
    const seen: number[] = [];
    effect(() => {
      if (count.get() === 1) throw new Error("effect failed");
      seen.push(count.get());
    });

    assert.throws(() => batch(() => count.set(1)), Error, "effect failed");
    count.set(2);
    expect(seen).toStrictEqual([0, 2]);
  });

  test("notifies right away about a signal a subscriber sets while the batch ends", () => {
    const count = signal(0);
    const mirror = signal(0);
    const seen: number[] = [];
    effect(() => {
      mirror.set(count.get());
    });
    effect(() => {
      seen.push(mirror.get());
    });

    batch(() => count.set(1));
    expect(seen).toStrictEqual([0, 1]);
  });

  test("batches again in a batch a subscriber starts while one ends", () => {
    const trigger = signal(0);
    const a = signal(0);
    const b = signal(0);
    const seen: string[] = [];
    effect(() => {
      const value = trigger.get();
      batch(() => {
        a.set(value);
        b.set(value);
      });
    });
    effect(() => {
      seen.push(`${a.get()} ${b.get()}`);
    });

    batch(() => trigger.set(1));
    expect(seen).toStrictEqual(["0 0", "1 1"]);
  });
});

// Every sequence of set() and get() calls of a given length inside a batch,
// on a small graph: a computed has its value from the signals as they are,
// inside the batch and after it, effects run once or not at all, and the
// subscriptions are right afterwards.
describe("batch, every sequence of sets and reads", () => {
  interface Graph {
    sources: Record<string, ReturnType<typeof signal<number>>>;
    computeds: Record<string, ReturnType<typeof computed<unknown>>>;
    // The computed signals' values, from the sources' values.
    expected: (values: Record<string, number>) => Record<string, unknown>;
  }
  type Op = { set: string; value: number } | { read: string };

  function check(graph: () => Graph, ops: Op[], length: number): void {
    const sequence: Op[] = [];
    const run = (): void => {
      const { sources, computeds, expected } = graph();
      const values: Record<string, number> = {};
      for (const name in sources) values[name] = sources[name].get();
      const seen: Record<string, unknown[]> = {};
      for (const name in computeds) {
        seen[name] = [];
        effect(() => {
          seen[name].push(computeds[name].get());
        });
        seen[name].length = 0;
      }
      const before = expected(values);
      const at = () =>
        sequence.map((op) => ("set" in op ? `${op.set}=${op.value}` : op.read)).join(", ");

      batch(() => {
        for (const op of sequence) {
          if ("set" in op) {
            values[op.set] = op.value;
            sources[op.set].set(op.value);
          } else if (computeds[op.read].get() !== expected(values)[op.read]) {
            assert.fail(`${op.read} inside the batch: ${at()}`);
          }
        }
        for (const name in seen) if (seen[name].length) assert.fail(`effect in the batch: ${at()}`);
      });
      const after = expected(values);
      for (const name in computeds) {
        const runs = after[name] === before[name] ? [] : [after[name]];
        if (computeds[name].get() !== after[name] || String(seen[name]) !== String(runs)) {
          assert.fail(`${name} after the batch (effect: ${String(seen[name])}): ${at()}`);
        }
      }
      // The subscriptions: every later set() reaches what reads it.
      for (const name in sources) {
        values[name] += 10;
        sources[name].set(values[name]);
        const now = expected(values);
        for (const computedName in computeds) {
          if (computeds[computedName].get() !== now[computedName]) {
            assert.fail(`${computedName} after ${name} was set later: ${at()}`);
          }
        }
      }
    };
    const extend = (): void => {
      if (sequence.length === length) return run();
      for (const op of ops) {
        sequence.push(op);
        extend();
        sequence.pop();
      }
    };
    extend();
  }

  test("a chain of computeds", () => {
    check(
      () => {
        const count = signal(1);
        const other = signal(0);
        const double = computed(() => count.get() * 2);
        const label = computed(() => String(double.get()));
        const unrelated = computed(() => other.get() + 1);
        return {
          sources: { count, other },
          computeds: { double, label, unrelated },
          expected: ({ count, other }) => ({
            double: count * 2,
            label: String(count * 2),
            unrelated: other + 1,
          }),
        };
      },
      [
        { set: "count", value: 1 },
        { set: "count", value: 2 },
        { set: "other", value: 1 },
        { read: "double" },
        { read: "label" },
      ],
      6,
    );
  });

  test("a computed that switches between signals", () => {
    check(
      () => {
        const flag = signal(0);
        const left = signal(1);
        const right = signal(1);
        const selected = computed(() => (flag.get() ? right.get() : left.get()));
        const double = computed(() => selected.get() * 2);
        return {
          sources: { flag, left, right },
          computeds: { selected, double },
          expected: ({ flag, left, right }) => ({
            selected: flag ? right : left,
            double: (flag ? right : left) * 2,
          }),
        };
      },
      [
        { set: "flag", value: 0 },
        { set: "flag", value: 1 },
        { set: "left", value: 2 },
        { set: "right", value: 2 },
        { set: "right", value: 1 },
        { read: "selected" },
        { read: "double" },
      ],
      5,
    );
  });
});
