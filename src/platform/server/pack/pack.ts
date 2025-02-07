import type { CargoContext } from "@cargo/cargo";
import { join } from "@std/path/join";
import { parse } from "@std/path/parse";

import type { PageLike, ParcelApp } from "../parcel.ts";
import type { List } from "./mod.ts";
import { mapPath } from "./path-mapping.ts";
import { info } from "@cargo/cargo/utils/logger";

export function packPages<T>(
  pages: List["pages"],
  Parcel: ParcelApp<T>,
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
    Parcel.addPage(path.path, {
      page,
      layouts,
      middleware,
      statusCode: path.statusCode,
    });
  }
  return Parcel;
}

export async function packIslands<T>(
  islands: List["islands"],
  scripts: List["scripts"],
  scriptsDirectory: string,
  Parcel: ParcelApp<T>,
) {
  if (islands) {
    for (const [islandPath, island] of Object.entries(islands)) {
      const script = scripts.find((s) =>
        parse(s[1]).name === parse(islandPath).name
      );
      if (script) {
        Parcel.addIsland(island.default, {
          path: join(script[0], script[1]),
          contents: await readScript(
            join(scriptsDirectory, script[1]),
          ),
          imports: script[2].imports,
        });
      } else {
        info(
          "PACK",
          `Frontend script for island "${islandPath}" not found. Island was not added to Cargo Parcel`,
        );
      }
    }
  }
  return Parcel;
}

export async function packScripts<T extends CargoContext>(
  scripts: List["scripts"],
  scriptsDirectory: string,
  Parcel: ParcelApp<T>,
): Promise<ParcelApp<T>> {
  if (scripts?.length) {
    for (const script of scripts) {
      Parcel.addScript(
        join(script[0], script[1]),
        await readScript(join(
          scriptsDirectory,
          script[1],
        )),
        script[2],
      );
    }
  }
  return Parcel;
}
function readScript(path: string): Promise<Uint8Array> {
  return Deno.readFile(join(
    Deno.cwd(),
    path,
  ));
}
