import { NotFoundException } from "@huuma/route/http/exception/not-found-exception";
import { array, object, string, unknown } from "@huuma/validate";
import { info } from "@huuma/route/utils/logger";
import { parse } from "@std/path/parse";
import { join } from "@std/path/join";

import type { PageLike, Resolver, UIApp, UIAppContext } from "../app.ts";

import { generateHash } from "./list/utils.ts";
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
      const script = scripts.find((s) =>
        parse(s[1]).name === parse(islandPath).name
      );
      if (script) {
        app.addIsland(island.default, {
          path: join("_huuma", script[0], script[1]),
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
      const fileHash = await generateHash(`/${key}`);
      app.post(`/_huuma/remote/${fileHash}/${fileName}`, async ({ body }) => {
        const { remoteFunction, args } = remoteFunctionsSchema.parse(body);
        if (
          remoteFunction in remoteFunctions &&
          typeof remoteFunctions[remoteFunction] === "function"
        ) {
          const res = await remoteFunctions[remoteFunction](
            ...(args?.length ? args : []),
          );
          return new Response(JSON.stringify(res), {
            headers: { "content-type": "application/json" },
          });
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
