import { afterEach, describe, expect, test } from "vite-plus/test";

import { createUIApp } from "./app.ts";
import type { Metadata, MetadataGenerator } from "./metadata.ts";

const HEADERS = {
  "X-Frame-Options": "DENY",
  "Cache-Control": "public, max-age=60",
  expires: "Thu, 01 Jan 2099 00:00:00 GMT",
};

async function headers(metadata: Metadata | MetadataGenerator<unknown>) {
  const app = createUIApp(({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  ));
  app.addPage("/", {
    page: () => <p>page</p>,
    layouts: [],
    middleware: [],
    resolvers: [],
    statusCode: 200,
    metadata,
  });
  const response = await app.deliver()(new Request("http://localhost/"), {
    remoteAddr: { transport: "tcp" },
  });
  await response.body?.cancel();
  return response.headers;
}

describe("a page's metadata.headers", () => {
  const env = { NODE_ENV: process.env.NODE_ENV, HUUMA_ENV: process.env.HUUMA_ENV };
  const setEnv = (values: { NODE_ENV?: string; HUUMA_ENV?: string }) => {
    for (const name of ["NODE_ENV", "HUUMA_ENV"] as const) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
  };
  afterEach(() => setEnv(env));

  test("are sent outside production too, except the caching ones", async () => {
    for (const NODE_ENV of [undefined, "development", "test"]) {
      setEnv({ NODE_ENV });
      for (const metadata of [{ headers: HEADERS }, () => ({ headers: HEADERS })]) {
        const sent = await headers(metadata);
        expect(sent.get("x-frame-options"), NODE_ENV).toStrictEqual("DENY");
        expect(sent.get("cache-control"), NODE_ENV).toBeNull();
        expect(sent.get("expires"), NODE_ENV).toBeNull();
      }
    }
  });

  test("are all sent in production, by NODE_ENV or HUUMA_ENV", async () => {
    for (const values of [{ NODE_ENV: "production" }, { HUUMA_ENV: "PROD" }]) {
      setEnv(values);
      const sent = await headers({ headers: HEADERS });
      const name = JSON.stringify(values);
      expect(sent.get("x-frame-options"), name).toStrictEqual("DENY");
      expect(sent.get("cache-control"), name).toStrictEqual("public, max-age=60");
      expect(sent.get("expires"), name).toStrictEqual("Thu, 01 Jan 2099 00:00:00 GMT");
    }
  });

  test("leave the page's other headers as they are without any", async () => {
    setEnv({});
    const sent = await headers({ title: "No headers" });
    expect(sent.get("content-type")).toMatch(/^text\/html/);
    expect(sent.get("content-security-policy")).toContain("script-src-elem 'nonce-");
  });
});
