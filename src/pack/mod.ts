import type { Middleware } from "@cargo/cargo/middleware";
import type { CargoContext } from "@cargo/cargo";

import { mapPath } from "./path-mapping.ts";
import { createList } from "./list.ts";
import type { PageLike, ParcelApp } from "../parcel.ts";
import { info } from "@cargo/cargo/utils/logger";
import type { JSX } from "../jsx-runtime/mod.ts";
import { Bundler } from "./bundler.ts";
import { join } from "@std/path/join";

export type PageRoute = {
  page: Renderable;
  layouts: Renderable[];
  middleware: { default: Middleware[] }[];
};

type Renderable = {
  default: PageLike;
};

export interface List {
  pages: Record<string, PageRoute>;
  islands?: Record<string, { default: JSX.Component }>;
  scripts?: string[];
}

export function pack<T extends CargoContext>(
  parcel: ParcelApp<T>,
  list: List,
): ParcelApp<T> {
  for (const route in list.pages) {
    const page: PageLike = list.pages[route].page.default;
    const layouts: PageLike[] = list.pages[route].layouts.map((layout) => {
      return layout.default;
    });

    const middleware = list.pages[route].middleware
      .map((module) => {
        return module.default;
      })
      .flat();

    const path = mapPath(route);
    parcel.addPage(path.path, {
      page,
      layouts,
      middleware,
      statusCode: path.statusCode,
    });
  }
  if (list.islands) {
    for (const [path, island] of Object.entries(list.islands)) {
      parcel.addIsland(path, island.default);
    }
  }

  if (list.scripts?.length) {
    for (const script of list.scripts) {
      // parcel.get()
    }
  }

  return parcel;
}

export async function prepare<T extends CargoContext>(
  Parcel: ParcelApp<T>,
  options?: {
    enableLiveReload?: boolean;
  },
): Promise<ParcelApp<T>> {
  const pagesPath = "pages";
  const packPath = ".pack";
  try {
    await createPackDirectory(packPath);
    const list = await createList({ pagesPath, packPath });

    Parcel = pack(
      options?.enableLiveReload !== false ? enableLiveReload(Parcel) : Parcel,
      list,
    );

    const bundler = new Bundler(
      Parcel.entryPoints,
    );

    const _files = await bundler.bundle();
    bundler.stop();

    for (const [name, content] of _files) {
      await Deno.writeFile(join(packPath, name), content);
    }

    return Parcel;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      info(
        "PACK",
        `Could not find '${pagesPath}' directory while packaging the application. Please ensure it exists.`,
        "Parcel",
      );
    }
    throw e;
  }
}

export async function createPackDirectory(path: string) {
  try {
    await Deno.mkdir(path);
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) {
      return;
    }
    throw e;
  }
}

export function enableLiveReload<T extends CargoContext>(
  Parcel: ParcelApp<T>,
): ParcelApp<T> {
  Parcel.get("/_websocket", (ctx) => {
    if (ctx.request.headers.get("upgrade") === "websocket") {
      return Deno.upgradeWebSocket(ctx.request).response;
    }
    return new Response(
      `Websocket connection failed to upgrade. Have you set the header 'upgrade=websocket' properly?`,
      { status: 400 },
    );
  });

  Parcel.registerEntryPoint({
    "_live-reload":
      new URL("../platform/browser/live-reload.ts", import.meta.url).href,
  });

  return Parcel;
}
