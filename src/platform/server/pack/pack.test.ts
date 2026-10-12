import { assert, describe, expect, test } from "vite-plus/test";
import { executeRemoteFunction } from "./pack.ts";

// Type alias for the per-file remote-function map shape used by the helper.
// Tests pass plain functions returning Promises; the helper awaits them by
// name, exactly as the real route handler does.
type RemoteFunctions = Record<
  string,
  (...args: unknown[]) => Promise<unknown>
>;

// Test stubs return resolved/rejected promises directly instead of using
// `async () => ...` to avoid the `require-await` lint on trivial fixtures
// (real remote functions `await` DB/IO work; these stubs just need to be
// awaitable). Behavior is identical from the helper's perspective.
const resolve = <T>(value: T): Promise<T> => Promise.resolve(value);

describe("executeRemoteFunction: void/undefined return → 204 No Content", () => {
  test(
    "explicit `return;` resolves to a 204 with empty body",
    async () => {
      const fns: RemoteFunctions = { noop: () => resolve(undefined) };
      const res = await executeRemoteFunction(fns, "noop", undefined);
      expect(res.status).toStrictEqual(204);
      expect(await res.text()).toStrictEqual("");
    },
  );

  test("explicit `return undefined` also yields 204", async () => {
    const fns: RemoteFunctions = { noop: () => resolve(undefined) };
    const res = await executeRemoteFunction(fns, "noop", undefined);
    expect(res.status).toStrictEqual(204);
    expect(await res.text()).toStrictEqual("");
  });
});

test("executeRemoteFunction: null return → 200 body `null`", async () => {
  const fns: RemoteFunctions = { returnsNull: () => resolve(null) };
  const res = await executeRemoteFunction(fns, "returnsNull", undefined);
  expect(res.status).toStrictEqual(200);
  expect(await res.text()).toStrictEqual("null");
});

test(
  "executeRemoteFunction: void vs null distinction is preserved",
  async () => {
    const voidRes = await executeRemoteFunction(
      { f: () => resolve(undefined) },
      "f",
      undefined,
    );
    const nullRes = await executeRemoteFunction(
      { f: () => resolve(null) },
      "f",
      undefined,
    );
    expect(voidRes.status).toStrictEqual(204);
    expect(nullRes.status).toStrictEqual(200);
    expect(await nullRes.text()).toStrictEqual("null");
  },
);

describe("executeRemoteFunction: JSON-serializable return → 200 body", () => {
  test("object return is serialized verbatim", async () => {
    const fns: RemoteFunctions = {
      createUser: () => resolve({ success: true, user: { name: "Ada" } }),
    };
    const res = await executeRemoteFunction(fns, "createUser", undefined);
    expect(res.status).toStrictEqual(200);
    expect(await res.text()).toStrictEqual(JSON.stringify({ success: true, user: { name: "Ada" } }));
    expect(res.headers.get("content-type")).toStrictEqual("application/json");
  });

  test("args are forwarded to the remote function", async () => {
    const fns: RemoteFunctions = {
      add: (a: unknown, b: unknown) => resolve((a as number) + (b as number)),
    };
    const res = await executeRemoteFunction(fns, "add", [2, 3]);
    expect(res.status).toStrictEqual(200);
    expect(await res.text()).toStrictEqual("5");
  });
});

test(
  "executeRemoteFunction: BigInt return → 500 RemoteFunctionSerializationError",
  async () => {
    const fns: RemoteFunctions = { big: () => resolve(1n) };
    const res = await executeRemoteFunction(fns, "big", undefined);
    expect(res.status).toStrictEqual(500);
    expect(res.headers.get("content-type")).toStrictEqual("application/json");
    const body = await res.json();
    expect(body.name).toStrictEqual("RemoteFunctionSerializationError");
    expect(body.message).toStrictEqual('Remote function "big" returned a value that cannot be JSON-serialized: Do not know how to serialize a BigInt');
  },
);

test(
  "executeRemoteFunction: circular reference → 500 RemoteFunctionSerializationError",
  async () => {
    const fns: RemoteFunctions = {
      circular: () => {
        const o: Record<string, unknown> = {};
        o.self = o;
        return resolve(o);
      },
    };
    const res = await executeRemoteFunction(fns, "circular", undefined);
    expect(res.status).toStrictEqual(500);
    const body = await res.json();
    expect(body.name).toStrictEqual("RemoteFunctionSerializationError");
    // The circular-reference error message is multi-line and engine-specific
    // (V8 adds `--> starting at...` / `--- property ... closes the circle`);
    // assert only the stable prefix.
    expect(body.message).toContain('Remote function "circular" returned a value that cannot be JSON-serialized: Converting circular structure to JSON');
  },
);

test(
  "executeRemoteFunction: function return (silent JSON.stringify failure) → 500 RemoteFunctionSerializationError",
  async () => {
    const fns: RemoteFunctions = { returnsFn: () => resolve(() => 42) };
    const res = await executeRemoteFunction(fns, "returnsFn", undefined);
    expect(res.status).toStrictEqual(500);
    const body = await res.json();
    expect(body.name).toStrictEqual("RemoteFunctionSerializationError");
    expect(body.message).toStrictEqual('Remote function "returnsFn" returned a value that cannot be JSON-serialized (function)');
  },
);

test(
  "executeRemoteFunction: Symbol return (silent JSON.stringify failure) → 500 RemoteFunctionSerializationError",
  async () => {
    const fns: RemoteFunctions = { returnsSym: () => resolve(Symbol("x")) };
    const res = await executeRemoteFunction(fns, "returnsSym", undefined);
    expect(res.status).toStrictEqual(500);
    const body = await res.json();
    expect(body.name).toStrictEqual("RemoteFunctionSerializationError");
    expect(body.message).toStrictEqual('Remote function "returnsSym" returned a value that cannot be JSON-serialized (symbol)');
  },
);

test(
  "executeRemoteFunction: user-thrown error propagates (NOT wrapped) — locks in current Round-1-pending behavior",
  async () => {
    class ValidationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ValidationError";
      }
    }
    const fns: RemoteFunctions = {
      save: () => Promise.reject(new ValidationError("email is required")),
    };
    // The helper does not catch user-thrown errors; they propagate to the
    // framework's handleException. This test pins that behavior so a future
    // Round 1 change (wrapping with { name, message }) is a deliberate,
    // visible diff rather than an accidental regression.
    const error = await executeRemoteFunction(fns, "save", undefined).catch(
      (thrown: unknown) => thrown,
    );
    assert(error instanceof ValidationError);
    expect(error.message).toContain("email is required");
    expect(error.name).toStrictEqual("ValidationError");
  },
);
