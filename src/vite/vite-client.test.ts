import { describe, expect, test } from "vite-plus/test";

import { allowViteWorker, injectViteClient, withViteClient } from "./vite-client.ts";

describe(injectViteClient.name, () => {
  test("adds the client at the end of <head>", () => {
    expect(injectViteClient("<html><head><title>x</title></head><body></body></html>", "/")).toBe(
      '<html><head><title>x</title><script type="module" src="/@vite/client"></script></head><body></body></html>',
    );
  });

  test("uses the base and the page's nonce", () => {
    expect(injectViteClient("<head></head>", "/shop/", "abc")).toBe(
      '<head><script type="module" src="/shop/@vite/client" nonce="abc"></script></head>',
    );
  });

  test("without <head>, after <html>, after the doctype or at the start", () => {
    expect(injectViteClient("<!DOCTYPE html><html><p>x</p></html>", "/")).toBe(
      '<!DOCTYPE html><html><script type="module" src="/@vite/client"></script><p>x</p></html>',
    );
    expect(injectViteClient("<!DOCTYPE html><p>x</p>", "/")).toBe(
      '<!DOCTYPE html><script type="module" src="/@vite/client"></script><p>x</p>',
    );
    expect(injectViteClient("<p>x</p>", "/")).toBe(
      '<script type="module" src="/@vite/client"></script><p>x</p>',
    );
  });
});

describe(withViteClient.name, () => {
  test("leaves HTML responses without a body alone", async () => {
    for (const status of [204, 304]) {
      const response = new Response(null, { status, headers: { "content-type": "text/html" } });
      expect(await withViteClient(response, "/")).toBe(response);
    }
  });

  test("keeps status and headers, but drops a stale Content-Length", async () => {
    const response = await withViteClient(
      new Response("<head></head>", {
        status: 404,
        headers: { "content-type": "text/html", "content-length": "13", "x-app": "1" },
      }),
      "/",
    );
    expect(response.status).toStrictEqual(404);
    expect(response.headers.get("x-app")).toStrictEqual("1");
    expect(response.headers.has("content-length")).toStrictEqual(false);
    expect(await response.text()).toContain("/@vite/client");
  });

  test("lets the page's policy allow Vite's worker", async () => {
    const response = await withViteClient(
      new Response("<head></head>", {
        headers: { "content-security-policy": "script-src 'none'" },
      }),
      "/",
    );
    expect(response.headers.get("content-security-policy")).toStrictEqual(
      "script-src 'none'; worker-src blob:",
    );
  });
});

describe(allowViteWorker.name, () => {
  test("adds blob: to a copy of the directive workers fall back to", () => {
    expect(allowViteWorker("script-src-elem 'nonce-abc'; script-src 'none'")).toStrictEqual(
      "script-src-elem 'nonce-abc'; script-src 'none'; worker-src blob:",
    );
    expect(allowViteWorker("default-src 'self'; child-src https://a.example")).toStrictEqual(
      "default-src 'self'; child-src https://a.example; worker-src https://a.example blob:",
    );
    expect(allowViteWorker("default-src 'self'")).toStrictEqual(
      "default-src 'self'; worker-src 'self' blob:",
    );
  });

  test("adds blob: to worker-src, once", () => {
    expect(allowViteWorker("worker-src 'self'; script-src 'none'")).toStrictEqual(
      "worker-src 'self' blob:; script-src 'none'",
    );
    expect(allowViteWorker("worker-src blob:")).toStrictEqual("worker-src blob:");
  });

  test("leaves a policy that doesn't restrict workers alone", () => {
    expect(allowViteWorker("img-src 'self'")).toStrictEqual("img-src 'self'");
  });
});
