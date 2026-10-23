import { describe, expect, test } from "vite-plus/test";

import { worker } from "./runtime.ts";

describe(worker.name, () => {
  // An app that answers with the path and method it saw.
  const app = {
    fetch: (request: Request, env?: unknown) =>
      Promise.resolve(
        new Response(`app ${request.method} ${new URL(request.url).pathname}`, {
          headers: { "x-env": String(env !== undefined) },
        }),
      ),
  };
  const get = (handler: ReturnType<typeof worker>, path: string, init?: RequestInit) =>
    handler.fetch(new Request(`http://localhost${path}`, init), {}, {});

  test("is the app itself at /", () => {
    expect(worker(app, "/")).toBe(app);
  });

  test("passes requests to the app without the base, with env", async () => {
    const handler = worker(app, "/shop/");
    const response = await get(handler, "/shop/about");
    expect(await response.text()).toStrictEqual("app GET /about");
    expect(response.headers.get("x-env")).toStrictEqual("true");
    const post = await get(handler, "/shop/_huuma/remote/1/a", { method: "POST", body: "{}" });
    expect(await post.text()).toStrictEqual("app POST /_huuma/remote/1/a");
  });

  test("redirects / to the base and doesn't find the rest", async () => {
    const handler = worker(app, "/shop/");
    expect((await get(handler, "/")).headers.get("location")).toStrictEqual("/shop/");
    expect((await get(handler, "/about")).status).toStrictEqual(404);
  });
});
