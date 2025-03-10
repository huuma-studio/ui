import type { AppContext } from "@huuma/route";
import { join } from "@std/path/join";
import { parse } from "@std/path/parse";

import type { PageLike, UIApp } from "../app.ts";
import type { List } from "./mod.ts";
import { mapPath } from "./path-mapping.ts";
import { info } from "@huuma/route/utils/logger";

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
          path: join(script[0], script[1]),
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
        join(script[0], script[1]),
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
function readScript(path: string): Promise<Uint8Array> {
  return Deno.readFile(join(
    Deno.cwd(),
    path,
  ));
}
