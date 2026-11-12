import { assert, describe, expect, test } from "vite-plus/test";

import { createUIApp } from "../app.ts";
import { executeRemoteFunction, readRemoteBody, serveRemoteFunctions } from "./pack.ts";

// Type alias for the per-file remote-function map shape used by the helper.
// Tests pass plain functions returning Promises; the helper awaits them by
// name, exactly as the real route handler does.
type RemoteFunctions = Record<string, (...args: unknown[]) => Promise<unknown>>;

// Test stubs return resolved/rejected promises directly instead of using
// `async () => ...` to avoid the `require-await` lint on trivial fixtures
// (real remote functions `await` DB/IO work; these stubs just need to be
// awaitable). Behavior is identical from the helper's perspective.
const resolve = <T>(value: T): Promise<T> => Promise.resolve(value);

describe("executeRemoteFunction: void/undefined return → 204 No Content", () => {
  test("explicit `return;` resolves to a 204 with empty body", async () => {
    const fns: RemoteFunctions = { noop: () => resolve(undefined) };
    const res = await executeRemoteFunction(fns, "noop", undefined);
    expect(res.status).toStrictEqual(204);
    expect(await res.text()).toStrictEqual("");
  });

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

test("executeRemoteFunction: void vs null distinction is preserved", async () => {
  const voidRes = await executeRemoteFunction({ f: () => resolve(undefined) }, "f", undefined);
  const nullRes = await executeRemoteFunction({ f: () => resolve(null) }, "f", undefined);
  expect(voidRes.status).toStrictEqual(204);
  expect(nullRes.status).toStrictEqual(200);
  expect(await nullRes.text()).toStrictEqual("null");
});

describe("executeRemoteFunction: JSON-serializable return → 200 body", () => {
  test("object return is serialized verbatim", async () => {
    const fns: RemoteFunctions = {
      createUser: () => resolve({ success: true, user: { name: "Ada" } }),
    };
    const res = await executeRemoteFunction(fns, "createUser", undefined);
    expect(res.status).toStrictEqual(200);
    expect(await res.text()).toStrictEqual(
      JSON.stringify({ success: true, user: { name: "Ada" } }),
    );
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

test("executeRemoteFunction: BigInt return → 500 RemoteFunctionSerializationError", async () => {
  const fns: RemoteFunctions = { big: () => resolve(1n) };
  const res = await executeRemoteFunction(fns, "big", undefined);
  expect(res.status).toStrictEqual(500);
  expect(res.headers.get("content-type")).toStrictEqual("application/json");
  const body = await res.json();
  expect(body.name).toStrictEqual("RemoteFunctionSerializationError");
  expect(body.message).toStrictEqual(
    'Remote function "big" returned a value that cannot be JSON-serialized: Do not know how to serialize a BigInt',
  );
});

test("executeRemoteFunction: circular reference → 500 RemoteFunctionSerializationError", async () => {
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
  expect(body.message).toContain(
    'Remote function "circular" returned a value that cannot be JSON-serialized: Converting circular structure to JSON',
  );
});

test("executeRemoteFunction: function return (silent JSON.stringify failure) → 500 RemoteFunctionSerializationError", async () => {
  const fns: RemoteFunctions = { returnsFn: () => resolve(() => 42) };
  const res = await executeRemoteFunction(fns, "returnsFn", undefined);
  expect(res.status).toStrictEqual(500);
  const body = await res.json();
  expect(body.name).toStrictEqual("RemoteFunctionSerializationError");
  expect(body.message).toStrictEqual(
    'Remote function "returnsFn" returned a value that cannot be JSON-serialized (function)',
  );
});

test("executeRemoteFunction: Symbol return (silent JSON.stringify failure) → 500 RemoteFunctionSerializationError", async () => {
  const fns: RemoteFunctions = { returnsSym: () => resolve(Symbol("x")) };
  const res = await executeRemoteFunction(fns, "returnsSym", undefined);
  expect(res.status).toStrictEqual(500);
  const body = await res.json();
  expect(body.name).toStrictEqual("RemoteFunctionSerializationError");
  expect(body.message).toStrictEqual(
    'Remote function "returnsSym" returned a value that cannot be JSON-serialized (symbol)',
  );
});

test("executeRemoteFunction: user-thrown error propagates (NOT wrapped) — locks in current Round-1-pending behavior", async () => {
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
});

describe(serveRemoteFunctions.name, () => {
  // Calls of `add`, to check refused requests never reach it.
  const calls: unknown[][] = [];
  const app = createUIApp(({ children }) => children);
  serveRemoteFunctions(app, "/_huuma/remote/1a2b3c4d/math.remote", {
    add: (a: number, b: number) => {
      calls.push([a, b]);
      return resolve(a + b);
    },
  });
  const handle = app.deliver();
  const call = (headers: Record<string, string>) =>
    handle(
      new Request("http://localhost/_huuma/remote/1a2b3c4d/math.remote", {
        method: "POST",
        headers,
        body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
      }),
      { remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 } },
    );

  test("answers the JSON requests the browser stub sends", async () => {
    for (const type of ["application/json", "application/json; charset=utf-8"]) {
      const response = await call({ "content-type": type, "sec-fetch-site": "same-origin" });
      expect(response.status, type).toStrictEqual(200);
      expect(await response.json(), type).toStrictEqual(3);
    }
    // Without Sec-Fetch-Site too, e.g. from older browsers or other clients.
    expect((await call({ "content-type": "application/json" })).status).toStrictEqual(200);
  });

  test("refuses bodies a form or another site can send without a preflight", async () => {
    calls.length = 0;
    for (const headers of [
      { "content-type": "text/plain" },
      { "content-type": "application/x-www-form-urlencoded" },
      { "content-type": "multipart/form-data; boundary=x" },
      {} as Record<string, string>,
    ]) {
      const response = await call(headers);
      expect(response.status, JSON.stringify(headers)).toStrictEqual(415);
      await response.body?.cancel();
    }
    expect(calls).toStrictEqual([]);
  });

  test("refuses requests a browser marks as cross-site", async () => {
    calls.length = 0;
    const response = await call({
      "content-type": "application/json",
      "sec-fetch-site": "cross-site",
    });
    expect(response.status).toStrictEqual(403);
    await response.body?.cancel();
    expect(calls).toStrictEqual([]);
  });
});

describe("the body limit of remote functions", () => {
  const endpoint = "http://localhost/_huuma/remote/1a2b3c4d/text.remote";
  const calls: number[] = [];
  const serve = (options?: Parameters<typeof createUIApp>[1]) => {
    const app = createUIApp(({ children }) => children, options);
    serveRemoteFunctions(app, new URL(endpoint).pathname, {
      length: (text: string) => {
        calls.push(text.length);
        return resolve(text.length);
      },
    });
    return app.deliver();
  };
  const body = (length: number) =>
    JSON.stringify({ remoteFunction: "length", args: ["a".repeat(length)] });
  // `chunks` of `size` bytes each inside the argument, without a
  // Content-Length. `pulled` counts the chunks the server asked for.
  const streamed = (chunks: number, size: number, pulled = { count: 0 }) => {
    const encoder = new TextEncoder();
    let sent = 0;
    return new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>(
        {
          start: (controller) =>
            controller.enqueue(encoder.encode('{"remoteFunction":"length","args":["')),
          pull(controller) {
            pulled.count++;
            if (sent++ < chunks) controller.enqueue(encoder.encode("a".repeat(size)));
            else {
              controller.enqueue(encoder.encode('"]}'));
              controller.close();
            }
          },
        },
        { highWaterMark: 0 },
      ),
      duplex: "half",
    } as RequestInit);
  };
  const post = (text: string) =>
    new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": `${text.length}` },
      body: text,
    });

  test("is 1 MiB by default", async () => {
    calls.length = 0;
    const handle = serve();
    const within = await handle(post(body(1024 * 1024 - 100)));
    expect(within.status).toStrictEqual(200);
    expect(await within.json()).toStrictEqual(1024 * 1024 - 100);

    const over = await handle(post(body(1024 * 1024)));
    expect(over.status).toStrictEqual(413);
    await over.body?.cancel();
    expect(calls).toStrictEqual([1024 * 1024 - 100]);
  });

  test("refuses a streamed body that passes the limit, and reads it to its end", async () => {
    calls.length = 0;
    const pulled = { count: 0 };
    const response = await serve()(streamed(64, 128 * 1024, pulled));
    expect(response.status).toStrictEqual(413);
    await response.body?.cancel();
    expect(calls).toStrictEqual([]);
    // All 8 MiB, discarded: the client gets its answer once it sent them
    // (see `readRemoteBody()`).
    expect(pulled.count).toStrictEqual(65);
  });

  test("accepts a streamed body within the limit", async () => {
    const response = await serve()(streamed(4, 1024));
    expect(response.status).toStrictEqual(200);
    expect(await response.json()).toStrictEqual(4096);
  });

  test("is `remote.maxBodySize` of the app, to the byte", async () => {
    const text = body(10);
    const exact = await serve({ remote: { maxBodySize: text.length } })(post(text));
    expect(exact.status).toStrictEqual(200);
    await exact.body?.cancel();

    for (const request of [post(text), streamed(1, 10)]) {
      const response = await serve({ remote: { maxBodySize: text.length - 1 } })(request);
      expect(response.status).toStrictEqual(413);
      await response.body?.cancel();
    }

    const unlimited = await serve({ remote: { maxBodySize: Infinity } })(streamed(40, 64 * 1024));
    expect(unlimited.status).toStrictEqual(200);
    expect(await unlimited.json()).toStrictEqual(40 * 64 * 1024);
  });

  test("must be a number of bytes", () => {
    for (const maxBodySize of [-1, NaN, "1mb" as unknown as number]) {
      expect(() => serve({ remote: { maxBodySize } })).toThrow(RangeError);
    }
  });

  test("reads characters split between two chunks, and fails like `request.json()`", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ text: "grüße €" }));
    const chunked = (bytes: Uint8Array) =>
      new Request(endpoint, {
        method: "POST",
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            // One byte a chunk: every multi-byte character is split.
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit);
    expect(await readRemoteBody(chunked(bytes), 1024)).toStrictEqual({ text: "grüße €" });

    await expect(readRemoteBody(chunked(bytes.slice(0, 5)), 1024)).rejects.toThrow(SyntaxError);
    await expect(readRemoteBody(new Request(endpoint, { method: "POST" }), 1024)).rejects.toThrow(
      SyntaxError,
    );
  });
});
