// The build with the adapter, in Cloudflare's workerd through `wrangler
// dev`, from the `wrangler.json` the build writes, which `wrangler deploy`
// deploys: at the base / and below another base.
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { huuma } from "@huuma/ui/vite";
import { baseDirectory } from "@huuma/ui/vite/adapter";
import { createBuilder, type Plugin } from "vite";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { buildFixture, IMAGE_PAGE, startWorker } from "../../../test/build.ts";
import { remoteEndpoint } from "../../../src/platform/server/remote.ts";
import { cloudflare } from "./mod.ts";

type Manifest = Record<string, { file: string }>;

const IMMUTABLE = "public, max-age=31536000, immutable";

// Starting workerd takes a few seconds.
const STARTUP = 60_000;

// Without `main`: the adapter's Worker is the app. The KV namespace is
// local to wrangler dev, empty at the start.
const WRANGLER = JSON.stringify({
  name: "huuma-fixture",
  compatibility_date: "2026-10-01",
  kv_namespaces: [{ binding: "KV", id: "huuma-fixture" }],
});

function describeWorker(name: string, base: string) {
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
      root = await buildFixture(
        ".tmp-build-cloudflare-",
        { base, plugins: [huuma({ adapter: cloudflare({ inspectorPort: false }) }), count] },
        { ...IMAGE_PAGE, "wrangler.jsonc": WRANGLER },
      );
      manifest = JSON.parse(
        await readFile(
          join(root, "dist/client", baseDirectory(base), ".vite/manifest.json"),
          "utf8",
        ),
      ) as Manifest;
      ({ origin, stop } = await startWorker(root));
    }, STARTUP);
    afterAll(async () => {
      process.env.NODE_ENV = nodeEnv;
      stop?.();
      await rm(root, { recursive: true, force: true });
    });

    test("builds the client, then the server, once each", () => {
      expect(builds).toStrictEqual(["client", "ssr"]);
    });

    test("deploys the client build as Workers' static assets, not Node's server", async () => {
      // Cloudflare's wrangler.json names `dist/client`, not the client
      // build's `outDir` below the base.
      const config = JSON.parse(
        await readFile(join(root, "dist/server/wrangler.json"), "utf8"),
      ) as { main: string; assets: { directory: string } };
      expect(config.assets.directory).toStrictEqual("../client");
      expect(await readdir(join(root, "dist/server"))).not.toContain("server.js");
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

test("writes Workers' files to dist/client, for the hashed files", async () => {
  const root = await buildFixture(
    ".tmp-build-cloudflare-files-",
    { base: "/shop/", plugins: [huuma({ adapter: cloudflare({ inspectorPort: false }) })] },
    { "wrangler.jsonc": WRANGLER },
  );
  try {
    const ignore = await readFile(join(root, "dist/client/.assetsignore"), "utf8");
    expect(ignore.split("\n")).toContain(".vite");
    const headers = await readFile(join(root, "dist/client/_headers"), "utf8");
    expect(headers).toContain(`/shop/assets/*\n  Cache-Control: ${IMMUTABLE}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("removes the files of an earlier build with another base", async () => {
  // Built at the base /, as before the app moved below /shop/.
  const root = await buildFixture(
    ".tmp-build-cloudflare-rebase-",
    { plugins: [huuma({ adapter: cloudflare({ inspectorPort: false }) })] },
    { "wrangler.jsonc": WRANGLER },
  );
  const build = async (base: string) => {
    const builder = await createBuilder({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [huuma({ adapter: cloudflare({ inspectorPort: false }) })],
      base,
    });
    await builder.buildApp();
  };
  try {
    await build("/shop/");
    // No `assets/` from the base /, which Workers would serve at /assets/.
    expect(await readdir(join(root, "dist/client"))).toStrictEqual(
      [".assetsignore", "_headers", "shop"].sort(),
    );

    // Deeper: no `shop/assets/` from the base /shop/ either.
    await build("/shop/admin/");
    expect(await readdir(join(root, "dist/client"))).toStrictEqual(
      [".assetsignore", "_headers", "shop"].sort(),
    );
    expect(await readdir(join(root, "dist/client/shop"))).toStrictEqual(["admin"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
