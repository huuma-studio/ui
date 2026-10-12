import { afterEach, describe, expect, test } from "vite-plus/test";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { toRequest, writeResponse } from "./node-http.ts";

/** Serves `handler` through the bridge on a random port. */
async function serve(handler: (request: Request) => Response | Promise<Response>) {
  const server = createServer((req, res) => {
    const request = toRequest(req, new AbortController().signal);
    void Promise.resolve(handler(request)).then((response) => writeResponse(response, res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

describe("node-http", () => {
  test("passes method, URL and headers through", async () => {
    const origin = await serve(
      (request) =>
        new Response(
          JSON.stringify({
            method: request.method,
            url: request.url,
            header: request.headers.get("x-test"),
          }),
        ),
    );

    const response = await fetch(`${origin}/about?tab=1`, {
      method: "DELETE",
      headers: { "x-test": "yes" },
    });
    expect(await response.json()).toStrictEqual({
      method: "DELETE",
      url: `${origin}/about?tab=1`,
      header: "yes",
    });
  });

  test("streams request bodies", async () => {
    const origin = await serve(async (request) => new Response(await request.text()));

    const response = await fetch(origin, { method: "POST", body: "a".repeat(100_000) });
    expect((await response.text()).length).toStrictEqual(100_000);
  });

  test("keeps a path that looks like a host as a path", async () => {
    const origin = await serve((request) => new Response(new URL(request.url).pathname));

    // fetch() would normalize `//`, so send the raw request line.
    const body = await new Promise<string>((resolve, reject) => {
      const req = request(`${origin}//evil.example/x`, (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve(text));
      });
      req.on("error", reject);
      req.end();
    });
    expect(body).toStrictEqual("//evil.example/x");
  });

  test("writes status, headers and each cookie separately", async () => {
    const origin = await serve(() => {
      const headers = new Headers({ "content-type": "text/plain" });
      headers.append("set-cookie", "a=1");
      headers.append("set-cookie", "b=2");
      return new Response("created", { status: 201, statusText: "Created", headers });
    });

    const response = await fetch(origin);
    expect(response.status).toStrictEqual(201);
    expect(response.statusText).toStrictEqual("Created");
    expect(response.headers.get("content-type")).toStrictEqual("text/plain");
    expect(response.headers.getSetCookie()).toStrictEqual(["a=1", "b=2"]);
    expect(await response.text()).toStrictEqual("created");
  });

  test("ends bodyless responses", async () => {
    const origin = await serve(() => new Response(null, { status: 204 }));
    const response = await fetch(origin);
    expect(response.status).toStrictEqual(204);
    expect(await response.text()).toStrictEqual("");
  });
});
