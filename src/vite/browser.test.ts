// The basic fixture in a real browser (headless Chromium): islands hydrate,
// call remote functions and update in place, in the dev server and in the
// production build. Skipped without Chromium, except in CI (test/browser.ts).
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, type ViteDevServer } from "vite";
import type { ChildProcess } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright-core";

import { button, findChromium, launchChromium, open } from "../../test/browser.ts";
import { buildFixture, fixtures, startServer } from "../../test/build.ts";
import { huuma } from "./mod.ts";

const chromium = findChromium();

describe.skipIf(chromium === undefined)("in a browser", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchChromium(chromium!);
  });
  afterAll(async () => {
    await browser?.close();
  });

  describe("vite dev", () => {
    // A copy of the basic fixture, inside test/fixtures so `@huuma/ui` still
    // resolves to this repo; some tests edit it.
    let root: string;
    let server: ViteDevServer;
    let origin: string;

    beforeAll(async () => {
      root = await mkdtemp(join(fixtures, ".tmp-browser-dev-"));
      await cp(join(fixtures, "basic"), root, { recursive: true });
      server = await createServer({
        root,
        configFile: false,
        logLevel: "silent",
        server: { host: "127.0.0.1", port: 0 },
        plugins: [huuma()],
      });
      await server.listen();
      origin = new URL(server.resolvedUrls!.local[0]!).origin;
    });
    afterAll(async () => {
      await server?.close();
      await rm(root, { recursive: true, force: true });
    });

    test("hydrates islands", async () => {
      const { page, errors } = await open(browser, `${origin}/`);
      expect(await page.textContent("p")).toStrictEqual("Hello Ada");
      await page.click("button");
      await button(page, "2");
      expect(errors).toStrictEqual([]);
      await page.close();
    });

    test("calls remote functions", async () => {
      const { page, errors } = await open(browser, `${origin}/remote`);
      await page.click("button");
      await button(page, "2");
      await page.click("button");
      await button(page, "4");
      expect(errors).toStrictEqual([]);
      await page.close();
    });

    test("updates an edited island in place, keeping its state", async () => {
      const { page, errors } = await open(browser, `${origin}/`);
      await page.click("button");
      await button(page, "2");
      // Gone if the page reloads.
      await page.evaluate(() => Object.assign(window, { loaded: true }));

      const counter = join(root, "app/counter.client.tsx");
      const code = await readFile(counter, "utf8");
      // Same hooks, new markup: the island keeps its count.
      await writeFile(counter, code.replace(">{count}</button>", ">Count: {count}</button>"));
      await button(page, "Count: 2");
      // Vite's watcher reports a file once per short window, so an edit
      // right after the last one's update would go unnoticed (plain Vite too).
      await new Promise((resolve) => setTimeout(resolve, 200));
      // Another initial value: the island starts over.
      await writeFile(
        counter,
        code
          .replace("$signal(start)", "$signal(start + 10)")
          .replace(">{count}</button>", ">Count: {count}</button>"),
      );
      await button(page, "Count: 11");

      expect(await page.evaluate(() => "loaded" in window)).toStrictEqual(true);
      expect(errors).toStrictEqual([]);
      await page.close();
    });

    test("reloads the page after a page edit", async () => {
      const { page, errors } = await open(browser, `${origin}/about`);
      await page.evaluate(() => Object.assign(window, { loaded: true }));

      await writeFile(
        join(root, "app/about/page.tsx"),
        "export default function About() {\n  return <h1>About us</h1>;\n}\n",
      );
      await page.getByRole("heading", { name: "About us" }).waitFor({ timeout: 5_000 });

      expect(await page.evaluate(() => "loaded" in window)).toStrictEqual(false);
      expect(errors).toStrictEqual([]);
      await page.close();
    });
  });

  describe("node dist/server/server.js", () => {
    let root: string;
    let server: ChildProcess;
    let origin: string;
    const nodeEnv = process.env.NODE_ENV;

    beforeAll(async () => {
      // As with `vite build`; Vitest sets "test", which builds JSX in dev mode.
      process.env.NODE_ENV = "production";
      root = await buildFixture(".tmp-browser-build-");
      ({ origin, server } = await startServer(root));
    });
    afterAll(async () => {
      process.env.NODE_ENV = nodeEnv;
      server?.kill();
      await rm(root, { recursive: true, force: true });
    });

    test("hydrates islands", async () => {
      const { page, errors } = await open(browser, `${origin}/`);
      expect(await page.textContent("p")).toStrictEqual("Hello Ada");
      await page.click("button");
      await button(page, "2");
      expect(errors).toStrictEqual([]);
      await page.close();
    });

    test("calls remote functions", async () => {
      const { page, errors } = await open(browser, `${origin}/remote`);
      await page.click("button");
      await button(page, "2");
      expect(errors).toStrictEqual([]);
      await page.close();
    });
  });
});
