import { NotFoundException } from "@huuma/route/http/exception/not-found-exception";
import { describe, expect, test, vi } from "vite-plus/test";

import { createUIApp, type PageLike, type PageProps } from "./app.ts";
import { packPages, serveRemoteFunctions } from "./pack/pack.ts";

const connection = { remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 } };

function props(page: PageLike<unknown>, more: Partial<PageProps<unknown>> = {}) {
  return { page, layouts: [], middleware: [], resolvers: [], statusCode: 200, ...more };
}

// An app with a page, a remote module and a not-found page, as
// `app/!404/page.tsx` registers it.
function app(setup?: (app: ReturnType<typeof createUIApp>) => void) {
  const app = createUIApp(({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  ));
  setup?.(app);
  app.addPage(
    "/about",
    props(() => <h1>About</h1>),
  );
  serveRemoteFunctions(app, "/_huuma/remote/a1b2c3d4/sum.remote", {
    sum: (a: number, b: number) => Promise.resolve(a + b),
  });
  app.addNotFoundPage(
    "/*",
    props(() => <h1>Not found</h1>, { statusCode: 404 }),
  );
  return app.deliver();
}

const send = (handle: ReturnType<typeof app>, method: string, path: string, body?: unknown) =>
  handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    connection,
  );

describe("a not-found page", () => {
  test("answers a GET request no route answers, with 404", async () => {
    const response = await send(app(), "GET", "/nope");
    expect(response.status).toStrictEqual(404);
    expect(response.headers.get("content-type")).toStrictEqual("text/html; charset=utf-8");
    expect(await response.text()).toContain("<h1>Not found</h1>");
  });

  test("answers HEAD like GET, without a body", async () => {
    const response = await send(app(), "HEAD", "/nope");
    expect(response.status).toStrictEqual(404);
    expect(response.headers.get("content-type")).toStrictEqual("text/html; charset=utf-8");
    expect(await response.text()).toStrictEqual("");
  });

  test("leaves other methods to the router: 404, not 405", async () => {
    const handle = app();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await send(handle, method, "/nope", {});
      expect(response.status, method).toStrictEqual(404);
      expect(response.headers.get("allow"), method).toStrictEqual(null);
      await response.body?.cancel();
    }
  });

  test("leaves a remote call with an endpoint the app doesn't have at 404", async () => {
    // E.g. a browser with the stubs of an earlier deploy.
    const response = await send(app(), "POST", "/_huuma/remote/ffff0000/sum.remote", {
      remoteFunction: "sum",
      args: [1, 2],
    });
    expect(response.status).toStrictEqual(404);
    await response.body?.cancel();
  });

  test("leaves the routes of the app as they are", async () => {
    const handle = app();
    expect(await (await send(handle, "GET", "/about")).text()).toContain("<h1>About</h1>");
    const sum = await send(handle, "POST", "/_huuma/remote/a1b2c3d4/sum.remote", {
      remoteFunction: "sum",
      args: [1, 2],
    });
    expect(await sum.json()).toStrictEqual(3);
    // A page with another method is a 405, as the router answers it.
    const put = await send(handle, "PUT", "/about", {});
    expect(put.status).toStrictEqual(405);
    expect(put.headers.get("allow")).toStrictEqual("GET, HEAD");
    await put.body?.cancel();
  });

  test("answers a page that throws NotFoundException, e.g. for a missing record", async () => {
    const handle = app((app) => {
      app.addPage(
        "/users/:id",
        props(() => {
          throw new NotFoundException();
        }),
      );
    });
    const response = await send(handle, "GET", "/users/7");
    expect(response.status).toStrictEqual(404);
    expect(await response.text()).toContain("<h1>Not found</h1>");
  });

  test("runs inside the app's middleware", async () => {
    const handle = app((app) => {
      app.use(async (_ctx, next) => {
        const response = await next();
        response.headers.set("x-app", "yes");
        return response;
      });
    });
    const response = await send(handle, "GET", "/nope");
    expect(response.status).toStrictEqual(404);
    expect(response.headers.get("x-app")).toStrictEqual("yes");
    await response.body?.cancel();
  });
});

describe("not-found pages in directories", () => {
  // As `packPages()` registers `app/!404`, `app/blog/!404` and
  // `app/[lang]/!404` from the Vite plugin's routes.
  function pages() {
    const app = createUIApp(({ children }) => (
      <html>
        <body>{children}</body>
      </html>
    ));
    const page = (default_: PageLike<unknown>) => ({
      page: { default: default_ },
      layouts: [],
      middleware: [],
    });
    packPages(
      {
        "/!404": page(() => <h1>Not found</h1>),
        "/blog/!404": page(() => <h1>No such post</h1>),
        "/[lang]/docs/!404": page(({ params }) => <h1>No such doc in {params.lang}</h1>),
      } as never,
      app,
    );
    return app.deliver();
  }

  test("answer below their directory, the deepest first", async () => {
    const handle = pages();
    const text = async (path: string) => {
      const response = await send(handle, "GET", path);
      expect(response.status, path).toStrictEqual(404);
      return response.text();
    };
    expect(await text("/blog/nope")).toContain("<h1>No such post</h1>");
    expect(await text("/blog/a/b")).toContain("<h1>No such post</h1>");
    expect(await text("/nope")).toContain("<h1>Not found</h1>");
    expect(await text("/blogs")).toContain("<h1>Not found</h1>");
  });

  test("get their params decoded", async () => {
    const response = await send(pages(), "GET", "/caf%C3%A9/docs/nope");
    expect(await response.text()).toContain("<h1>No such doc in café</h1>");
  });

  test("aren't routes: other methods get 404", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await send(pages(), "POST", "/blog/nope", {});
      expect(response.status).toStrictEqual(404);
      await response.body?.cancel();
    } finally {
      log.mockRestore();
    }
  });
});
