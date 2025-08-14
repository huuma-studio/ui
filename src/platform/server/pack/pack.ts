import type { AppContext } from "@huuma/route";
import { join } from "@std/path/join";
import { parse } from "@std/path/parse";
import { array, object, string, unknown } from "@huuma/validate";

import type { PageLike, UIApp } from "../app.ts";
import type { List } from "./mod.ts";
import { mapPath } from "./path-mapping.ts";
import { info } from "@huuma/route/utils/logger";
import { generateHash } from "./bundler.ts";
import { NotFoundException } from "@huuma/route/http/exception/not-found-exception";

export function packPages<T>(
  pages: List["pages"],
  app: UIApp<T>,
) {
  for (const route in pages) {
    const page: PageLike<unknown> = pages[route].page.default;
    const layouts: PageLike<unknown>[] = pages[route].layouts.map(
      (layout) => {
        return layout.default;
      },
    );

    const middleware = pages[route].middleware
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
    });
  }
  return app;
}

export async function packIslands<T>(
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

export async function packScripts<T extends AppContext>(
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

export async function packRemoteFunctions<T extends AppContext>(
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

function readScript(path: string): Promise<Uint8Array> {
  return Deno.readFile(join(
    Deno.cwd(),
    path,
  ));
}
