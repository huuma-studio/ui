import { NotFoundException } from "@huuma/route/http/exception/not-found-exception";
import { array, object, string, unknown } from "@huuma/validate";
import { info } from "@huuma/route/utils/logger";
import { parse } from "@std/path/parse";
import { join } from "@std/path/join";

import type { PageLike, Resolver, UIApp, UIAppContext } from "../app.ts";

import { generateHash, toCanonicalPath } from "./list/utils.ts";
import { mapPath } from "./path-mapping.ts";
import type { List } from "./mod.ts";

export function packPages<T extends UIAppContext>(
  pages: List["pages"],
  app: UIApp<T>,
) {
  for (const route in pages) {
    const _route = pages[route];
    const resolvers: Resolver<unknown>[] = [];
    const page: PageLike<unknown> = _route.page.default;
    const metadata = _route.page.metadata;
    const contentSecurityPolicy = _route.page.contentSecurityPolicy;

    if (typeof _route.page.resolver === "function") {
      resolvers.push(_route.page.resolver);
    }

    const layouts: PageLike<unknown>[] = _route.layouts.map(
      (layout) => {
        if (typeof layout.resolver === "function") {
          resolvers.push(layout.resolver);
        }
        return layout.default;
      },
    );

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

export async function packIslands<T extends UIAppContext>(
  islands: List["islands"],
  scripts: List["scripts"],
  scriptsDirectory: string,
  app: UIApp<T>,
) {
  if (islands) {
    for (const [islandPath, island] of Object.entries(islands)) {
      const islandHash = await generateHash(islandPath);
      const script = scripts.find((s) =>
        parse(s[1]).name === `${islandHash}-${parse(islandPath).name}`
      );
      if (script) {
        app.addIsland(island.default, {
          path: join(
            "_huuma",
            script[0],
            script[1],
          ),
          contents: await readScript(
            join(scriptsDirectory, script[1]),
          ),
          imports: script[2].imports,
        });
      } else {
        info(
          "PACK",
          `Frontend script for island "${islandPath}" not found. Island was not added to Huuma UI`,
        );
      }
    }
  }
  return app;
}

export async function packScripts<T extends UIAppContext>(
  scripts: List["scripts"],
  scriptsDirectory: string,
  app: UIApp<T>,
): Promise<UIApp<T>> {
  if (scripts?.length) {
    for (const script of scripts) {
      app.addScript(
        join("_huuma", script[0], script[1]),
        await readScript(join(
          scriptsDirectory,
          script[1],
        )),
        script[2],
      );
    }
  }
  return app;
}

export async function packRemoteFunctions<
  T extends UIAppContext,
>(
  _remoteFunctions: List["remoteFunctions"],
  app: UIApp<T>,
): Promise<UIApp<T>> {
  const remoteFunctionsSchema = object({
    remoteFunction: string(),
    args: array(unknown()).optional(),
  });
  if (_remoteFunctions) {
    for (const [key, remoteFunctions] of Object.entries(_remoteFunctions)) {
      const fileName = parse(key).name;
      const fileHash = await generateHash(toCanonicalPath(key));
      app.post(`/_huuma/remote/${fileHash}/${fileName}`, async ({ body }) => {
        const { remoteFunction, args } = remoteFunctionsSchema.parse(body);
        if (
          remoteFunction in remoteFunctions &&
          typeof remoteFunctions[remoteFunction] === "function"
        ) {
          return await executeRemoteFunction(
            remoteFunctions,
            remoteFunction,
            args,
          );
        }
        throw new NotFoundException(
          `Remote function "${remoteFunction}" not found`,
        );
      });
    }
  }
  return app;
}

function readScript(path: string): Promise<Uint8Array<ArrayBuffer>> {
  return Deno.readFile(join(
    Deno.cwd(),
    path,
  ));
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
  const res = await remoteFunctions[remoteFunction](
    ...(args?.length ? args : []),
  );

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
  let serialized: string;
  try {
    serialized = JSON.stringify(res);
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        name: "RemoteFunctionSerializationError",
        message:
          `Remote function "${remoteFunction}" returned a value that cannot be JSON-serialized: ${
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
