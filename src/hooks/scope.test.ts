import { assert, assertThrows } from "@std/assert";
import { $scope, type Scope, scopedFn } from "./scope.ts";
import { VNodeProps, VType } from "../v-node/mod.ts";

const createScope = (): Scope => ({
  type: VType.COMPONENT,
  [VNodeProps.OPTIONS]: { _GLOBAL: {} },
});

Deno.test(scopedFn.name, async (t) => {
  await t.step("provide the scope to the wrapped function", () => {
    const scope = createScope();
    assert(scopedFn(scope, () => $scope()) === scope);
    assertThrows(() => $scope(), Error, "No sync vnode scope found");
  });

  await t.step("restore the outer scope after a nested call", () => {
    const outer = createScope();
    const inner = createScope();

    const result = scopedFn(outer, () => {
      assert(scopedFn(inner, () => $scope()) === inner);
      // The outer scope must be active again after the nested call.
      return $scope();
    });

    assert(result === outer);
  });

  await t.step("clear the scope when the wrapped function throws", () => {
    assertThrows(
      () =>
        scopedFn(createScope(), () => {
          throw new Error("render failed");
        }),
      Error,
      "render failed",
    );

    // The stale scope must not leak out of the failed call.
    assertThrows(() => $scope(), Error, "No sync vnode scope found");
  });
});
