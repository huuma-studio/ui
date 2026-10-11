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
