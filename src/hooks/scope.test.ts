import { assert, describe, test } from "vite-plus/test";
import { $scope, type Scope, scopedFn } from "./scope.ts";
import { VNodeProps, VType } from "../v-node/mod.ts";

const createScope = (): Scope => ({
  type: VType.COMPONENT,
  [VNodeProps.OPTIONS]: { _GLOBAL: {} },
});

describe(scopedFn.name, () => {
  test("provide the scope to the wrapped function", () => {
    const scope = createScope();
    assert(scopedFn(scope, () => $scope()) === scope);
    assert.throws(() => $scope(), Error, "No sync vnode scope found");
  });

  test("restore the outer scope after a nested call", () => {
    const outer = createScope();
    const inner = createScope();

    const result = scopedFn(outer, () => {
      assert(scopedFn(inner, () => $scope()) === inner);
      // The outer scope must be active again after the nested call.
      return $scope();
    });

    assert(result === outer);
  });

  test("clear the scope when the wrapped function throws", () => {
    assert.throws(
      () =>
        scopedFn(createScope(), () => {
          throw new Error("render failed");
        }),
      Error,
      "render failed",
    );

    // The stale scope must not leak out of the failed call.
    assert.throws(() => $scope(), Error, "No sync vnode scope found");
  });
});
