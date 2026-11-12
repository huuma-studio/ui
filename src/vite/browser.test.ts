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
import { buildFixture, fixtures, freePort, startServer } from "../../test/build.ts";
import { huuma } from "./mod.ts";

const chromium = findChromium();

// Added only to this suite's production fixture, without changing the
// shared fixture's routes or its build snapshots.
const EXTRA_FILES = {
  "components/frame.client.tsx": `
    import type { JSX } from "@huuma/ui/jsx-runtime";
    export default function Frame({ children }: JSX.ComponentProps) {
      return <section>{children}</section>;
    }
  `,
  "components/nested-counter.client.tsx": `
    import type { JSX } from "@huuma/ui/jsx-runtime";
    import { $signal } from "@huuma/ui/hooks/signal";
    export default function Counter({ label, children }: JSX.ComponentProps & { label: string }) {
      const count = $signal(0);
      return <article data-counter={label}>
        <button on-click={() => count.set(count.get() + 1)}>{label}: {count}</button>
        {children}
      </article>;
    }
  `,
  "components/themed.client.tsx": `
    import { $signal } from "@huuma/ui/hooks/signal";
    export default function Themed() {
      const on = $signal(false);
      return <button
        class={on.get() ? "toggle on" : "toggle off"}
        style={on.get()
          ? "color: rgb(0, 0, 255); margin: 2px; padding-left: 8px; padding-inline-start: 5px"
          : "color: rgb(255, 0, 0); margin: 1px 2px; padding-inline-start: 5px; padding-left: 8px"}
        on-click={() => on.set(!on.get())}
      >themed</button>;
    }
  `,
  "components/created.client.tsx": `
    import { $signal } from "@huuma/ui/hooks/signal";
    export default function Created() {
      const on = $signal(false);
      return <div>
        <button on-click={() => on.set(!on.get())}>create</button>
        {on.get() ? <select id="created" value="b"><option value="a">A</option><option value="b">B</option></select> : null}
        <select id="updated" value={on.get() ? "c" : "b"}>
          <option value="a">A</option>
          <option value="b">B</option>
          {on.get() ? <option value="c">C</option> : null}
        </select>
        <select id="unknown" value={on.get() ? "x" : "c"}>
          <option value="a" disabled>A</option>
          <option value="b">B</option>
          <option value="c">C</option>
        </select>
        <p id="raw" dangerouslySetInnerHTML={{ __html: on.get() ? "" : "<b>raw</b>" }}></p>
        <svg width="50" height="50">
          <foreignObject width="50" height="50">
            {on.get() ? <div id="html">html</div> : null}
          </foreignObject>
        </svg>
      </div>;
    }
  `,
  "app/created/page.tsx": `
    import Created from "../../components/created.client.tsx";
    export default function Page() {
      return <main><Created /></main>;
    }
  `,
  "app/themed/page.tsx": `
    import Themed from "../../components/themed.client.tsx";
    export default function Page() {
      return <main><Themed /></main>;
    }
  `,
  "app/nested/page.tsx": `
    import Frame from "../../components/frame.client.tsx";
    import Counter from "../../components/nested-counter.client.tsx";
    export default function Nested() {
      return <main>
        <Frame><div>
          <p>before</p>
          <Counter label="first"><span>first child</span></Counter>
          <Counter label="second"><span>second child</span></Counter>
          <p>after</p>
        </div></Frame>
        <Counter label="following"><span>following child</span></Counter>
      </main>;
    }
  `,
};

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
        // A fixed port, which a restart keeps.
        server: { host: "127.0.0.1", port: await freePort(), strictPort: true },
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
      // And it still counts, from where it was.
      await page.click("button");
      await button(page, "Count: 3");
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
      await page.click("button");
      await button(page, "Count: 12");

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

    test("reloads the page once a restarted dev server is back", async () => {
      const { page, errors } = await open(browser, `${origin}/about`);
      await page.evaluate(() => Object.assign(window, { loaded: true }));

      await server.restart();
      await page.waitForFunction(() => !("loaded" in window), undefined, { timeout: 5_000 });

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
      root = await buildFixture(".tmp-browser-build-", {}, EXTRA_FILES);
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

    test("hydrates nested slot islands without duplicating content or losing following islands", async () => {
      const { page, errors } = await open(browser, `${origin}/nested`);
      try {
        expect(errors).toStrictEqual([]);
        expect(await page.locator("article").count()).toBe(3);
        expect(await page.locator("main span").allTextContents()).toStrictEqual([
          "first child",
          "second child",
          "following child",
        ]);
        expect(await page.locator("main p").allTextContents()).toStrictEqual(["before", "after"]);
        for (const label of ["first", "second", "following"]) {
          await page.getByRole("button", { name: `${label}: 0`, exact: true }).click();
          await button(page, `${label}: 1`);
        }
        expect(errors).toStrictEqual([]);
      } finally {
        await page.close();
      }
    });

    test("created and updated elements are as the server renders them", async () => {
      const { page, errors } = await open(browser, `${origin}/created`);
      const value = (id: string) =>
        page.evaluate((id) => document.querySelector<HTMLSelectElement>(id)!.value, id);
      try {
        expect(await value("#updated")).toStrictEqual("b");
        expect(await value("#unknown")).toStrictEqual("c");
        await page.click("button");
        await page.locator("#created").waitFor({ timeout: 5_000 });

        // A select's value selects its option, which is added after it.
        expect(await value("#created")).toStrictEqual("b");
        expect(await value("#updated")).toStrictEqual("c");
        // No such option: the first one that isn't disabled, as on a
        // page from the server.
        expect(await value("#unknown")).toStrictEqual("b");
        expect(await page.innerHTML("#raw")).toStrictEqual("");
        // HTML inside an SVG's <foreignObject>, which shows only as HTML.
        expect(
          await page.evaluate(() => {
            const html = document.querySelector("#html")!;
            return [html.namespaceURI, html.getBoundingClientRect().height > 0];
          }),
        ).toStrictEqual(["http://www.w3.org/1999/xhtml", true]);
        expect(errors).toStrictEqual([]);
      } finally {
        await page.close();
      }
    });

    test("an update keeps the classes and styles added to an element", async () => {
      const { page, errors } = await open(browser, `${origin}/themed`);
      const state = () =>
        page.evaluate(() => {
          const button = document.querySelector("button")!;
          const { classList, style } = button;
          return [
            [...classList].sort().join(" "),
            style.color,
            style.margin,
            style.filter,
            // The later of padding-left and padding-inline-start.
            getComputedStyle(button).paddingLeft,
          ];
        });
      try {
        // As a browser extension or a script would.
        await page.evaluate(() => {
          const element = document.querySelector("button")!;
          element.classList.add("extension");
          element.style.setProperty("filter", "invert(1)");
        });
        await page.click("button");
        await page.locator("button.on").waitFor({ timeout: 5_000 });
        expect(await state()).toStrictEqual([
          "extension on toggle",
          "rgb(0, 0, 255)",
          "2px",
          "invert(1)",
          "5px",
        ]);

        await page.click("button");
        await page.locator("button.off").waitFor({ timeout: 5_000 });
        expect(await state()).toStrictEqual([
          "extension off toggle",
          "rgb(255, 0, 0)",
          "1px 2px",
          "invert(1)",
          "8px",
        ]);
        expect(errors).toStrictEqual([]);
      } finally {
        await page.close();
      }
    });
  });
});
