// A namespace import, read only on the server: islands render in the
// browser too, where Vite replaces Node's modules with stubs that throw
// on access.
import * as asyncHooks from "node:async_hooks";
import type { Middleware } from "@huuma/route/middleware";
import type { RequestContext as RouteRequestContext } from "@huuma/route/http/request";
import type { ProtocolConnectionInfo } from "@huuma/route/protocol";

/**
 * The platform bindings of the app, such as Cloudflare Workers' KV, D1 or
 * R2. Empty until the app declares them once, by augmentation:
 *
 * ```ts
 * declare module "@huuma/ui/server" {
 *   interface Env {
 *     DB: D1Database;
 *   }
 * }
 * ```
 *
 * Only Workers have bindings: on Node and Deno, `env` is `{}` at runtime.
 */
export interface Env {}

/** The current request, as server code sees it. Read-only. */
export interface RequestContext {
  /** The incoming request. */
  readonly request: Request;
  /** The route's URL parameters, e.g. `id` for `app/users/[id]/page.tsx`. */
  readonly params: Readonly<Record<string, string | undefined>>;
  /** The URL's search parameters; repeated ones as arrays. */
  readonly searchParams: Readonly<Record<string, string | string[] | undefined>>;
  /** What the app's middleware set as `ctx.auth`, e.g. the logged-in user. */
  readonly auth: unknown;
  /** Platform bindings (see `Env`). */
  readonly env: Env;
  /** The client's address, as far as the platform knows it. */
  readonly connection: ProtocolConnectionInfo;
  /**
   * Keeps `promise` running after the response is sent (`ctx.waitUntil()`
   * on Workers). Elsewhere it keeps running anyway, and a rejection is logged.
   */
  waitUntil(promise: Promise<unknown>): void;
}

let storage: asyncHooks.AsyncLocalStorage<RequestContext> | undefined;

/** A read-only view of `ctx`. Its values stay live: `auth` set later shows. */
function view(ctx: RouteRequestContext): RequestContext {
  return Object.freeze({
    get request() {
      return ctx.request;
    },
    get params() {
      return ctx.params ?? {};
    },
    get searchParams() {
      return ctx.search ?? {};
    },
    get auth() {
      return ctx.auth;
    },
    get env() {
      return ctx.env as Env;
    },
    get connection() {
      return ctx.connection;
    },
    waitUntil(promise: Promise<unknown>) {
      ctx.waitUntil(promise);
    },
  });
}

/**
 * Runs the rest of the request with its context available to
 * `requestContext()`. `UIApp` registers it first, before the app's own
 * middleware.
 */
export const provideRequestContext: Middleware = (ctx, next) =>
  (storage ??= new asyncHooks.AsyncLocalStorage()).run(view(ctx), next);

/**
 * The current request: its `request`, `params`, `searchParams`, `auth`,
 * `env`, `connection` and `waitUntil()`. Works in remote functions, pages,
 * layouts, the root, `metadata()` and resolvers, middleware, and code they
 * call, such as `*.server.ts` modules.
 *
 * Throws outside a request: at a module's top level, or in the browser.
 * Work a request starts keeps its context, also after the response is
 * sent, such as a promise passed to `waitUntil()`.
 *
 * ```ts
 * // app/todos.remote.ts
 * import { requestContext } from "@huuma/ui/server";
 *
 * export async function addTodo(text: string) {
 *   const { env, auth } = requestContext();
 *   if (!auth) throw new UnauthorizedException();
 *   await env.DB.prepare("insert into todos (text) values (?)").bind(text).run();
 * }
 * ```
 */
export function requestContext(): RequestContext {
  const context = storage?.getStore();
  if (!context) {
    throw new Error(
      "requestContext() was called outside of a request: call it inside a remote " +
        "function, page, layout or middleware, or in code they call while the request " +
        "runs. It works on the server only, not in islands in the browser.",
    );
  }
  return context;
}

/** Whether a request is running, so `requestContext()` won't throw. */
export function hasRequestContext(): boolean {
  return storage?.getStore() !== undefined;
}
