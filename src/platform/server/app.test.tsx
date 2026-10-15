import { describe, expect, test } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import { createUIApp, type RootPageProps } from "./app.ts";
import { Launch } from "./scripts.ts";

function Root({ children, scripts, islands, transferState }: RootPageProps<unknown>) {
  return (
    <html>
      <body>
        {children}
        <meta
          name="island-scripts"
          content={scripts?.body.islands.map((script) => script.path).join(" ")}
        />
        <Launch body={scripts?.body} islands={islands} transferState={transferState} />
      </body>
    </html>
  );
}

// Two islands with the same file name in different directories, as the
// Vite dev server serves them: by source path, without a hash prefix.
function CounterA(): JSX.Element {
  return <button>a</button>;
}
function CounterB(): JSX.Element {
  return <button>b</button>;
}

function appWithIslands() {
  const app = createUIApp(Root);
  app.addScript("runtime.js", undefined, { isRuntime: true });
  app.addIsland(CounterA, { path: "app/a/counter.client.tsx" });
  app.addIsland(CounterB, { path: "app/b/counter.client.tsx" });
  app.addPage("/", {
    page: () => <CounterA />,
    layouts: [],
    middleware: [],
    resolvers: [],
    statusCode: 200,
  });
  return app.deliver();
}

const connection = { remoteAddr: { transport: "tcp" } };
const get = (handle: ReturnType<typeof appWithIslands>, path: string) =>
  handle(new Request(`http://localhost${path}`), connection);

describe("scripts served elsewhere", () => {
  test("load the page's island by path, even when file names repeat", async () => {
    const html = await (await get(appWithIslands(), "/")).text();

    expect(html).toContain('import { launch } from "/runtime.js";');
    expect(html).toContain('import $I1 from "/app/a/counter.client.tsx";');
    expect(html).not.toContain("/app/b/counter.client.tsx");
    // The scripts a root component gets, e.g. to preload them.
    expect(html).toContain('<meta name="island-scripts" content="app/a/counter.client.tsx"/>');
  });

  test("aren't served by the app", async () => {
    const handle = appWithIslands();
    expect((await get(handle, "/runtime.js")).status).toStrictEqual(404);
    expect((await get(handle, "/app/a/counter.client.tsx")).status).toStrictEqual(404);
  });

  test("with contents, the app serves them", async () => {
    const app = createUIApp(Root);
    app.addScript("entry.js", new TextEncoder().encode("export {};"), { isEntryPoint: true });
    const response = await app.deliver()(new Request("http://localhost/entry.js"), connection);

    expect(response.headers.get("content-type")).toStrictEqual("application/javascript");
    expect(await response.text()).toStrictEqual("export {};");
  });
});
