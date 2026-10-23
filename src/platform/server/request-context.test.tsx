import { describe, expect, test, vi } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import { createUIApp, type PageLike, type RootPageProps } from "./app.ts";
import { serveRemoteFunctions } from "./pack/pack.ts";
import { hasRequestContext, requestContext } from "./request-context.ts";

const connection = { remoteAddr: { transport: "tcp", hostname: "203.0.113.7", port: 4000 } };

/** Like a `*.server.ts` helper: reads the request without being passed it. */
function currentPath(): string {
  return new URL(requestContext().request.url).pathname;
}

function Root({ children }: RootPageProps<unknown>): JSX.Element {
  return (
    <html>
      <body data-root={currentPath()}>{children}</body>
    </html>
  );
}

function appWith(page: PageLike<unknown>, options?: Partial<Parameters<typeof addPage>[1]>) {
  const app = createUIApp(Root);
  addPage(app, { page, ...options });
  return app;
}

function addPage(
  app: ReturnType<typeof createUIApp>,
  props: { page: PageLike<unknown>; path?: string } & Record<string, unknown>,
) {
  const { path = "/users/:id", ...rest } = props;
  app.addPage(path, {
    layouts: [],
    middleware: [],
    resolvers: [],
    statusCode: 200,
    ...rest,
  });
}

function get(app: ReturnType<typeof createUIApp>, path: string) {
  return app.deliver()(new Request(`http://localhost${path}`), connection);
}

describe("requestContext()", () => {
  test("throws outside of a request", () => {
    expect(hasRequestContext()).toStrictEqual(false);
    expect(() => requestContext()).toThrow(
      "requestContext() was called outside of a request: call it inside a remote function, page, layout or middleware",
    );
  });

  test("is available in async pages, layouts, the root, metadata() and resolvers", async () => {
    const seen: Record<string, unknown> = {};
    const app = appWith(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        const { params, searchParams } = requestContext();
        seen.page = { params: { ...params }, searchParams: { ...searchParams } };
        return <p>{currentPath()}</p>;
      },
      {
        layouts: [
          async ({ children }: { children?: JSX.Element }) => {
            await Promise.resolve();
            seen.layout = currentPath();
            return <main>{children}</main>;
          },
        ],
        resolvers: [
          async () => {
            await Promise.resolve();
            seen.resolver = currentPath();
            return {};
          },
        ],
        metadata: async () => {
          await Promise.resolve();
          seen.metadata = currentPath();
          return { title: "x" };
        },
      },
    );

    const html = await (await get(app, "/users/7?tab=a&tab=b")).text();

    expect(html).toContain('<body data-root="/users/7"><main><p>/users/7</p></main></body>');
    expect(seen).toStrictEqual({
      page: { params: { id: "7" }, searchParams: { tab: ["a", "b"] } },
      layout: "/users/7",
      resolver: "/users/7",
      metadata: "/users/7",
    });
    expect(hasRequestContext()).toStrictEqual(false);
  });

  test("shows auth that the app's middleware sets, in remote functions too", async () => {
    const app = createUIApp(Root);
    // Registered after createUIApp(), like `app.use()` in server.ts.
    app.use(async (ctx, next) => {
      expect(requestContext().auth).toBeUndefined();
      ctx.auth = { user: ctx.request.headers.get("x-user") };
      return await next();
    });
    serveRemoteFunctions(app, "/_remote/users", {
      whoAmI: async () => {
        await Promise.resolve();
        return requestContext().auth;
      },
    });

    const response = await app.deliver()(
      new Request("http://localhost/_remote/users", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user": "ada" },
        body: JSON.stringify({ remoteFunction: "whoAmI", args: [] }),
      }),
      connection,
    );

    expect(await response.json()).toStrictEqual({ user: "ada" });
  });

  test("keeps concurrent requests apart", async () => {
    const release: Record<string, () => void> = {};
    const app = appWith(async () => {
      const id = requestContext().params.id!;
      await new Promise<void>((resolve) => (release[id] = resolve));
      return <p>{currentPath()}</p>;
    });

    const first = get(app, "/users/1");
    const second = get(app, "/users/2");
    await vi.waitFor(() => expect(Object.keys(release)).toHaveLength(2));
    // The second request finishes first.
    release["2"]();
    release["1"]();

    expect(await (await first).text()).toContain("<p>/users/1</p>");
    expect(await (await second).text()).toContain("<p>/users/2</p>");
  });

  test("gives the platform's env and waitUntil()", async () => {
    const waitUntil = vi.fn();
    const work = Promise.resolve();
    let context: ReturnType<typeof requestContext> | undefined;
    const app = appWith(() => {
      context = requestContext();
      context.waitUntil(work);
      return <p />;
    });

    // Called like a Cloudflare Worker: (request, env, ctx).
    await app.fetch(new Request("http://localhost/users/1"), { GREETING: "hi" }, { waitUntil });

    expect(context!.env).toStrictEqual({ GREETING: "hi" });
    expect(waitUntil).toHaveBeenCalledWith(work);
  });

  test("gives the connection", async () => {
    let context: ReturnType<typeof requestContext> | undefined;
    const app = appWith(() => {
      context = requestContext();
      return <p />;
    });
    await get(app, "/users/1");

    expect(context!.connection).toStrictEqual(connection);
    expect(context!.env).toStrictEqual({});
  });

  test("is read-only", async () => {
    let context: ReturnType<typeof requestContext> | undefined;
    const app = appWith(() => {
      context = requestContext();
      return <p />;
    });
    await get(app, "/users/1");

    expect("set" in context!).toStrictEqual(false);
    expect(() => {
      (context as { auth: unknown }).auth = "x";
    }).toThrow(TypeError);
  });
});
