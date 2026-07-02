import { assertEquals, assertThrows } from "@std/assert";
import { setSubscriber, signal } from "./mod.ts";

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
