import type { Middleware } from "@cargo/cargo/middleware";
import type { CargoContext } from "@cargo/cargo";

import { mapPath } from "./path-mapping.ts";
import { packPages } from "./pages.ts";
import type { PageLike, ParcelApp } from "../parcel.ts";

export type PageRoute = {
  page: Renderable;
  layouts: Renderable[];
  middleware: { default: Middleware[] }[];
};

type Renderable = {
  default: PageLike;
};

interface Pack {
  pages: Record<string, PageRoute>;
}

export function pack<T extends CargoContext>(
  parcel: ParcelApp<T>,
  pack: Pack,
): ParcelApp<T> {
  for (const route in pack.pages) {
    const page: PageLike = pack.pages[route].page.default;
    const layouts: PageLike[] = pack.pages[route].layouts.map((layout) => {
      return layout.default;
    });

    const middleware = pack.pages[route].middleware
      .map((module) => {
        return module.default;
      })
      .flat();

    const path = mapPath(route);

    parcel.get(
      path.path,
      parcel.pageHandler({
        root: parcel.root,
        page,
        layouts,
        middleware,
        statusCode: path.statusCode,
      }),
    );
  }

  return parcel;
}

export function prepare() {
  packPages({ path: "pages" });
}

export async function createPackDirectory() {
  try {
    await Deno.mkdir(".pack");
  } catch (e) {
    console.log(e.name);
  }
}
