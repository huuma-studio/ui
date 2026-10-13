import { describe, expect, test } from "vite-plus/test";

import type { JSX } from "../jsx-runtime/mod.ts";
import { createUIApp, type PageLikeProps, type RootPageProps } from "../platform/server/app.ts";
import { Launch } from "../platform/server/scripts.ts";
import { type Manifest, mount } from "./runtime.ts";

function Root({ children, scripts, islands, transferState }: RootPageProps<unknown>) {
  return (
    <html>
      <body>
        {children}
        <Launch body={scripts?.body} islands={islands} transferState={transferState} />
      </body>
    </html>
  );
}

function Counter(): JSX.Element {
  return <button>0</button>;
}

const manifest: Manifest = {
  runtime: "@id/__x00__virtual:huuma/runtime",
  islands: { "app/counter.client.tsx": { default: Counter } },
  remote: {
    "/_huuma/remote/1a2b3c4d/sum.remote": { add: async (a: number, b: number) => a + b },
  },
  pages: {
    "/": {
      page: { default: () => <Counter /> },
      layouts: [{ default: ({ children }: PageLikeProps<unknown>) => <main>{children}</main> }],
      middleware: [],
    },
    "/!404": {
      page: { default: () => <h1>Not found</h1> },
      layouts: [],
      middleware: [],
    },
  },
};

const connection = { remoteAddr: { transport: "tcp" } };

describe(mount.name, () => {
  test("registers the pages with their layouts, and the 404 catch-all", async () => {
    const handle = mount(createUIApp(Root), manifest).deliver();

    const home = await handle(new Request("http://localhost/"), connection);
    expect(home.status).toStrictEqual(200);
    expect(await home.text()).toContain("<main><!-- start_island_");

    const missing = await handle(new Request("http://localhost/nope"), connection);
    expect(missing.status).toStrictEqual(404);
    expect(await missing.text()).toContain("<h1>Not found</h1>");
  });

  test("launches islands from the browser paths Vite serves", async () => {
    const handle = mount(createUIApp(Root), manifest).deliver();
    const html = await (await handle(new Request("http://localhost/"), connection)).text();

    expect(html).toContain('import { launch } from "/@id/__x00__virtual:huuma/runtime";');
    expect(html).toContain('import $I1 from "/app/counter.client.tsx";');
  });

  test("serves the remote functions at their endpoints", async () => {
    const handle = mount(createUIApp(Root), manifest).deliver();
    const response = await handle(
      new Request("http://localhost/_huuma/remote/1a2b3c4d/sum.remote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
      }),
      connection,
    );
    expect(response.status).toStrictEqual(200);
    expect(await response.json()).toStrictEqual(3);
  });

  test("rejects a server entry without an app", () => {
    expect(() => mount(undefined as never, manifest)).toThrow(
      "The server entry must export the app as default",
    );
  });

  test("rejects an island without a default component", () => {
    expect(() =>
      mount(createUIApp(Root), { ...manifest, islands: { "app/broken.client.tsx": {} } }),
    ).toThrow('The island "app/broken.client.tsx" has no component as its default export.');
  });
});
