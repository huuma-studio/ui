import { describe, expect, test } from "vite-plus/test";

import { appBase, belowBase } from "./base.ts";

describe(appBase.name, () => {
  test("keeps a path", () => {
    expect(appBase("/")).toStrictEqual("/");
    expect(appBase("/shop/")).toStrictEqual("/shop/");
  });

  test("takes the path of a URL", () => {
    expect(appBase("https://cdn.example/shop/")).toStrictEqual("/shop/");
    expect(appBase("https://cdn.example/")).toStrictEqual("/");
    expect(appBase("//cdn.example/shop/")).toStrictEqual("/shop/");
  });

  test("is / for a relative base", () => {
    expect(appBase("./")).toStrictEqual("/");
    expect(appBase("")).toStrictEqual("/");
  });
});

describe(belowBase.name, () => {
  test("strips the base", async () => {
    const request = belowBase(new Request("http://localhost/shop/about?x=1"), "/shop/");
    expect(request instanceof Request && request.url).toStrictEqual("http://localhost/about?x=1");
    const root = belowBase(new Request("http://localhost/shop/"), "/shop/");
    expect(root instanceof Request && root.url).toStrictEqual("http://localhost/");
  });

  test("keeps the method, headers and body", async () => {
    const request = belowBase(
      new Request("http://localhost/shop/_huuma/remote/1/a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"args":[]}',
      }),
      "/shop/",
    ) as Request;
    expect(request.method).toStrictEqual("POST");
    expect(request.headers.get("content-type")).toStrictEqual("application/json");
    expect(await request.text()).toStrictEqual('{"args":[]}');
  });

  test("redirects / to the base and doesn't find the rest", async () => {
    const root = belowBase(new Request("http://localhost/?x=1"), "/shop/") as Response;
    expect(root.status).toStrictEqual(302);
    expect(root.headers.get("location")).toStrictEqual("/shop/?x=1");
    for (const path of ["/about", "/shop", "/shopping/"]) {
      const response = belowBase(new Request(`http://localhost${path}`), "/shop/");
      expect(response instanceof Response && response.status, path).toStrictEqual(404);
    }
  });

  test("leaves requests alone with the base /", () => {
    const request = new Request("http://localhost/about");
    expect(belowBase(request, "/")).toBe(request);
  });
});
