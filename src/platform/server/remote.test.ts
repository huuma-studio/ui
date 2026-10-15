import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { remoteEndpoint, remoteStub } from "./remote.ts";

describe(remoteEndpoint.name, () => {
  test("names the module by a hash of its path and its file name", async () => {
    expect(await remoteEndpoint("app/todo.remote.ts")).toMatch(
      /^\/_huuma\/remote\/[0-9a-f]{8}\/todo\.remote$/,
    );
  });

  test("is the same for a path with backslashes or a leading slash", async () => {
    const endpoint = await remoteEndpoint("app/todo.remote.ts");
    expect(await remoteEndpoint("app\\todo.remote.ts")).toStrictEqual(endpoint);
    expect(await remoteEndpoint("/app/todo.remote.ts")).toStrictEqual(endpoint);
  });

  test("differs for the same file name in another directory", async () => {
    expect(await remoteEndpoint("app/a/todo.remote.ts")).not.toStrictEqual(
      await remoteEndpoint("app/b/todo.remote.ts"),
    );
  });
});

describe(remoteStub.name, () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  afterEach(() => {
    fetch.mockReset();
  });

  /** Imports the stub as the browser would. */
  function load(
    exports: string[],
  ): Promise<Record<string, (...args: unknown[]) => Promise<unknown>>> {
    const code = remoteStub("/_huuma/remote/1a2b3c4d/todo.remote", exports);
    return import(`data:text/javascript,${encodeURIComponent(code)}`);
  }

  test("exports a function for each name, keeping the name", async () => {
    const stub = await load(["add", "default", "delete", "a-b"]);
    expect(Object.keys(stub).sort()).toStrictEqual(["a-b", "add", "default", "delete"]);
    expect(stub.add.name).toStrictEqual("add");
    expect(stub.delete.name).toStrictEqual("delete");
    expect(stub["a-b"].name).toStrictEqual("a-b");
  });

  test("posts the function's name and arguments as JSON", async () => {
    fetch.mockImplementation(async () => Response.json({ id: 1 }));
    const stub = await load(["add", "default"]);

    expect(await stub.add("milk", 2)).toStrictEqual({ id: 1 });
    expect(await stub.default()).toStrictEqual({ id: 1 });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toStrictEqual("/_huuma/remote/1a2b3c4d/todo.remote");
    expect(init?.method).toStrictEqual("POST");
    expect(new Headers(init?.headers).get("content-type")).toStrictEqual("application/json");
    expect(JSON.parse(init?.body as string)).toStrictEqual({
      args: ["milk", 2],
      remoteFunction: "add",
    });
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string).remoteFunction).toStrictEqual(
      "default",
    );
  });

  test("resolves to undefined for 204 No Content", async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await (await load(["add"])).add()).toStrictEqual(undefined);
  });

  test("rejects with the name and message of the server's error", async () => {
    fetch.mockResolvedValue(
      Response.json({ name: "ValidationError", message: "Too long" }, { status: 400 }),
    );
    const error = await (await load(["add"])).add().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toStrictEqual("ValidationError");
    expect((error as Error).message).toStrictEqual("Too long");
  });

  test("rejects with the status when the error has no JSON body", async () => {
    fetch.mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    const error = await (await load(["add"])).add().catch((error: unknown) => error);
    expect((error as Error).name).toStrictEqual("RemoteFunctionError");
    expect((error as Error).message).toStrictEqual("Remote function add failed (HTTP 502)");
  });
});
