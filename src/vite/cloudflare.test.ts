// The build in Cloudflare's workerd, through `wrangler dev`: `worker.js`
// with `dist/client` as Workers' static assets, at the base / and below
// another base; and the build with @cloudflare/vite-plugin, which deploys
// from the `wrangler.json` it writes.
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { cloudflare } from "@cloudflare/vite-plugin";
import type { Plugin } from "vite";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { buildFixture, IMAGE_PAGE, startWorker } from "../../test/build.ts";
import { remoteEndpoint } from "../platform/server/remote.ts";
import { baseDirectory } from "./base.ts";
import { huuma } from "./mod.ts";

type Manifest = Record<string, { file: string }>;

const IMMUTABLE = "public, max-age=31536000, immutable";

// Starting workerd takes a few seconds.
const STARTUP = 60_000;

// Local to wrangler dev, empty at the start.
const KV = [{ binding: "KV", id: "huuma-fixture" }];

function describeWorker(name: string, base: string, { plugin = false } = {}) {
  describe(name, () => {
    let root: string;
    let stop: (() => void) | undefined;
    let origin: string;
    let manifest: Manifest;
    // The environments the build built, in order.
    const builds: string[] = [];
    const nodeEnv = process.env.NODE_ENV;
    const path = (to: string) => `${origin}${base}${to}`;

    beforeAll(async () => {
      process.env.NODE_ENV = "production";
      const count: Plugin = {
        name: "count",
        buildStart() {
          builds.push(this.environment.name);
        },
      };
      if (plugin) {
        root = await buildFixture(
          ".tmp-build-cloudflare-",
          {
            base,
            plugins: [
              huuma(),
              cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: false }),
              count,
            ],
          },
          {
            ...IMAGE_PAGE,
            "wrangler.jsonc": JSON.stringify({
              name: "huuma-fixture",
              compatibility_date: "2026-10-01",
              main: "virtual:huuma/worker",
              kv_namespaces: KV,
            }),
          },
        );
      } else {
        root = await buildFixture(
          ".tmp-build-worker-",
          { base, plugins: [huuma(), count] },
          IMAGE_PAGE,
        );
      }
      manifest = JSON.parse(
        await readFile(
          join(root, "dist/client", baseDirectory(base), ".vite/manifest.json"),
          "utf8",
        ),
      ) as Manifest;
      ({ origin, stop } = await startWorker(
        root,
        plugin
          ? "dist/server/wrangler.json"
          : {
              main: "dist/server/worker.js",
              assets: { directory: "dist/client" },
              kv_namespaces: KV,
            },
      ));
    }, STARTUP);
    afterAll(async () => {
      process.env.NODE_ENV = nodeEnv;
      stop?.();
      await rm(root, { recursive: true, force: true });
    });

    test("builds the client, then the server, once each", () => {
      expect(builds).toStrictEqual(["client", "ssr"]);
    });

    test("renders pages, through the app's middleware", async () => {
      const response = await fetch(path("about"));
      expect(response.status).toStrictEqual(200);
      expect(response.headers.get("x-fixture-middleware")).toStrictEqual("app");
      expect(await response.text()).toContain("<h1>About</h1>");
      expect((await fetch(path("missing"))).status).toStrictEqual(404);
    });

    test("serves the islands, cached for good", async () => {
      const counter = manifest["app/counter.client.tsx"]!;
      const response = await fetch(path(counter.file));
      expect(response.status).toStrictEqual(200);
      expect(response.headers.get("cache-control")).toStrictEqual(IMMUTABLE);
      expect(await response.text()).toContain("export");
    });

    if (base !== "/") {
      test("serves the client files only below the base", async () => {
        const counter = manifest["app/counter.client.tsx"]!;
        expect((await fetch(`${origin}/${counter.file}`)).status).toStrictEqual(404);
      });
    }

    test("serves the files the server imports, from the client build", async () => {
      const page = await (await fetch(path("image"))).text();
      const src = /src="([^"]+\.svg)"/.exec(page)?.[1];
      expect(src).toStrictEqual(expect.stringMatching(/\/assets\/logo-[\w-]+\.svg$/));
      expect(src!.startsWith(`${base}assets/`)).toStrictEqual(true);
      const response = await fetch(`${origin}${src}`);
      expect(response.status).toStrictEqual(200);
      expect(response.headers.get("cache-control")).toStrictEqual(IMMUTABLE);
      const server = await readdir(join(root, "dist/server"), { recursive: true });
      expect(server).not.toContainEqual(expect.stringMatching(/\.svg$/));
    });

    test("doesn't serve the client manifest", async () => {
      const response = await fetch(path(".vite/manifest.json"));
      expect(response.status).toStrictEqual(404);
      expect(await response.text()).not.toContain("counter.client");
    });

    test("calls remote functions", async () => {
      const endpoint = path((await remoteEndpoint("app/sum.remote.ts")).slice(1));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
      });
      expect(await response.json()).toStrictEqual(3);
      // The CSRF checks work in a Worker too.
      const text = await fetch(endpoint, { method: "POST", body: "{}" });
      expect(text.status).toStrictEqual(415);
    });

    test("gives remote functions and pages the request context, with bindings", async () => {
      const endpoint = path((await remoteEndpoint("app/context.remote.ts")).slice(1));
      const call = async (remoteFunction: string, args: unknown[], user?: string) => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...(user ? { "x-user": user } : {}) },
          body: JSON.stringify({ remoteFunction, args }),
        });
        return response.status === 204 ? undefined : ((await response.json()) as unknown);
      };

      // `auth` from the app's middleware in server.ts.
      expect(await call("whoAmI", [], "ada")).toStrictEqual("ada");
      expect(await call("whoAmI", [])).toStrictEqual(null);
      // Stored through waitUntil(), after the response.
      expect(await call("remember", ["greeting", "hello"])).toBeUndefined();
      await vi.waitFor(async () =>
        expect(await call("recall", ["greeting"])).toStrictEqual("hello"),
      );

      const page = await (
        await fetch(path("context?q=search"), { headers: { "x-user": "ada" } })
      ).text();
      expect(page).toContain('<dd id="user">ada</dd>');
      expect(page).toContain('<dd id="greeting">hello</dd>');
      expect(page).toContain('<dd id="query">search</dd>');
    });
  });
}

describeWorker("a Cloudflare Worker", "/");

// Workers serves the files below the base, and the Worker strips the base.
describeWorker("a Cloudflare Worker below a base", "/shop/");

// In the directory `sale%`, which the rules in `_headers` name encoded.
describeWorker("a Cloudflare Worker below an encoded base", "/sale%25/");

// One build: Huuma's, which Cloudflare's plugin shapes into its Worker.
describeWorker("a Cloudflare Worker built with @cloudflare/vite-plugin", "/", { plugin: true });

// The plugin's wrangler.json names `dist/client`, not the client build's
// `outDir` below it.
describeWorker("a Cloudflare Worker built with @cloudflare/vite-plugin below a base", "/shop/", {
  plugin: true,
});
describeWorker(
  "a Cloudflare Worker built with @cloudflare/vite-plugin below an encoded base",
  "/sale%25/",
  { plugin: true },
);
