import { HttpException } from "@huuma/route/http/exception/http-exception";
import { NotFoundException } from "@huuma/route/http/exception/not-found-exception";
import { UnsupportedMediaTypeException } from "@huuma/route/http/exception/unsupported-media-type-exception";
import { array, object, string, unknown } from "@huuma/validate";

import type { PageLike, Resolver, UIApp, UIAppContext } from "../app.ts";

import { mapPath } from "./path-mapping.ts";
import type { List } from "./mod.ts";

export function packPages<T extends UIAppContext>(pages: List["pages"], app: UIApp<T>): UIApp<T> {
  for (const route in pages) {
    const _route = pages[route];
    const resolvers: Resolver<unknown>[] = [];
    const page: PageLike<unknown> = _route.page.default;
    const metadata = _route.page.metadata;
    const contentSecurityPolicy = _route.page.contentSecurityPolicy;

    if (typeof _route.page.resolver === "function") {
      resolvers.push(_route.page.resolver);
    }

    const layouts: PageLike<unknown>[] = _route.layouts.map((layout) => {
      if (typeof layout.resolver === "function") {
        resolvers.push(layout.resolver);
      }
      return layout.default;
    });

    const middleware = _route.middleware
      .map((module) => {
        return module.default;
      })
      .flat();

    const path = mapPath(route);
    app.addPage(path.path, {
      page,
      layouts,
      middleware,
      statusCode: path.statusCode,
      metadata,
      contentSecurityPolicy,
      resolvers,
    });
  }
  return app;
}

const remoteFunctionsSchema = object({
  remoteFunction: string(),
  args: array(unknown()).optional(),
});

/**
 * Refuses requests that the app's own browser stubs don't send, so other
 * sites can't call remote functions with a visitor's cookies (cross-site
 * request forgery):
 *
 * - Only `application/json` bodies. A cross-origin request with that type
 *   needs a CORS preflight, which the app doesn't answer unless it allows
 *   other origins itself. Forms and `text/plain` requests need none, so
 *   they could otherwise run a remote function from any site. `415`.
 * - Never `Sec-Fetch-Site: cross-site`, which current browsers send for
 *   requests from other sites. `403`.
 */
export function checkRemoteRequest(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpException("Remote functions can't be called from other sites.", 403);
  }
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    throw new UnsupportedMediaTypeException(
      "Remote functions accept application/json requests only.",
    );
  }
}

/**
 * Serves the functions of one remote module at `endpoint`: the browser
 * stub posts the function's name and arguments as JSON. Other requests are
 * refused (`checkRemoteRequest()`).
 */
export function serveRemoteFunctions<T extends UIAppContext>(
  app: UIApp<T>,
  endpoint: string,
  // deno-lint-ignore no-explicit-any
  remoteFunctions: Record<string, (...args: any[]) => Promise<any>>,
): UIApp<T> {
  app.post(endpoint, async ({ request }) => {
    checkRemoteRequest(request);
    const { remoteFunction, args } = remoteFunctionsSchema.parse(await request.json());
    if (
      remoteFunction in remoteFunctions &&
      typeof remoteFunctions[remoteFunction] === "function"
    ) {
      return await executeRemoteFunction(remoteFunctions, remoteFunction, args);
    }
    throw new NotFoundException(`Remote function "${remoteFunction}" not found`);
  });
  return app;
}

/**
 * @internal Not part of the public `@huuma/ui` API. Exported only so it can
 * be unit-tested directly; `mod.ts` does not re-export it and `pack.ts` is
 * not an entry point in `deno.json`'s exports map.
 *
 * Invokes a single remote function and produces the HTTP response. Extracted
 * from the route handler so the return-value normalization and serialization
 * branches are unit-testable without spinning up the framework.
 *
 * Behavior:
 *   - `undefined`/`void` return → `204 No Content`.
 *   - `null` or any JSON-serializable value → `200` with the JSON body.
 *   - `function`/`Symbol`/Symbol-keyed-only object (JSON.stringify returns
 *     undefined) → `500` with `RemoteFunctionSerializationError`.
 *   - `BigInt`/circular reference (JSON.stringify throws) → `500` with
 *     `RemoteFunctionSerializationError`.
 *
 * Errors thrown by the remote function itself are NOT caught here — they
 * propagate to the framework's global `handleException`, which emits
 * `{ status, message, error? }` (no `name`). Wrapping user-thrown errors
 * with a structured `{ name, message, ... }` body is a Round 1 concern.
 */
export async function executeRemoteFunction(
  remoteFunctions: Record<string, (...args: unknown[]) => Promise<unknown>>,
  remoteFunction: string,
  args: unknown[] | undefined,
): Promise<Response> {
  const res = await remoteFunctions[remoteFunction](...(args?.length ? args : []));

  // void / undefined return → 204 No Content. JSON has no `undefined`, so
  // an empty 204 body lets the client resolve to a real `undefined` instead
  // of failing to parse an empty JSON body.
  if (res === undefined) {
    return new Response(null, { status: 204 });
  }

  // Detect unserializable returns. Two failure modes:
  //   - JSON.stringify throws (BigInt, circular references)
  //   - JSON.stringify returns undefined for non-undefined input
  //     (function, Symbol, Symbol-keyed-only object)
  // We return a structured 500 directly rather than throwing, so the
  // response shape is independent of the framework's global error handler.
  // We still log so these failures are debuggable server-side, mirroring
  // the `console.error(error)` that `handleException` would have done.
  // Body shape is provisional pending the Round 1 wire-format decision.
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(res);
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        name: "RemoteFunctionSerializationError",
        message: `Remote function "${remoteFunction}" returned a value that cannot be JSON-serialized: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  if (serialized === undefined) {
    const error = new Error(
      `Remote function "${remoteFunction}" returned a value that cannot be JSON-serialized (${typeof res})`,
    );
    error.name = "RemoteFunctionSerializationError";
    console.error(error);
    return new Response(
      JSON.stringify({
        name: "RemoteFunctionSerializationError",
        message: error.message,
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(serialized, {
    headers: { "content-type": "application/json" },
  });
}
