import type { Middleware } from "@cargo/cargo/middleware";
import { info } from "@cargo/cargo/utils/logger";
import type { CargoContext } from "@cargo/cargo";
import { join } from "@std/path/join";
import type { PageLike, ParcelApp } from "../parcel.ts";
import type { JSX } from "../../../jsx-runtime/mod.ts";
import { Bundler, type EntryPoints } from "./bundler.ts";
import { createList, listIslands, listPages } from "./list.ts";
import { packIslands, packPages, packScripts } from "./pack.ts";
import { parse } from "@std/path";

export type PageRoute = {
  page: Renderable;
  layouts: Renderable[];
  middleware: { default: Middleware[] }[];
};

type Renderable = {
  default: PageLike<unknown>;
};

export interface List {
  pages: Record<string, PageRoute>;
  islands?: Record<string, { default: JSX.Component }>;
  scripts: [
    string,
    string,
    {
      isEntryPoint: boolean;
      isIsland: boolean;
      isRuntime: boolean;
      imports?: string[];
    },
  ][];
}

const packDirectory = ".pack";
const scriptsDirectory = join(packDirectory, ".scripts");

/**
 * Packs the application by adding pages, layouts, middleware, islands and scripts to the Parcel application.
 * This function takes a ParcelApp instance and a List of pages and components, then configures the application
 * with the provided routes, layouts, middleware, and client-side components.
 *
 * @param {ParcelApp<T>} Parcel - The Parcel application instance to pack
 * @param {List} List - Object containing pages, islands, and scripts to add to the application
 * @returns {Promise<ParcelApp<T>>} A promise that resolves with the configured ParcelApp instance
 */
export async function pack<T extends CargoContext>(
  Parcel: ParcelApp<T>,
  List: List,
): Promise<ParcelApp<T>> {
  const islandsScripts: List["scripts"] = [];
  const scripts: List["scripts"] = [];

  // Split islands and general scripts
  for (const script of List.scripts) {
    if (script[2].isIsland) {
      islandsScripts.push(script);
      continue;
    }
    scripts.push(script);
  }

  await packScripts(
    scripts,
    scriptsDirectory,
    Parcel,
  );

  await packIslands(
    List.islands,
    islandsScripts,
    scriptsDirectory,
    Parcel,
  );

  packPages(
    List.pages,
    Parcel,
  );

  return Parcel;
}

export async function list<T extends CargoContext>(
  Parcel: ParcelApp<T>,
  options?: {
    enableLiveReload?: boolean;
    isProd?: boolean;
  },
): Promise<ParcelApp<T>> {
  const pagesPath = "pages";

  const pages = await listPages(pagesPath);
  const islands = await listIslands("./");
  const scripts: List["scripts"] = [];

  const entryPoints: EntryPoints = {
    "_parcel_launch": {
      path: new URL("../../browser/mod.ts", import.meta.url).href,
      isRuntime: true,
    },
  };

  if (options?.enableLiveReload !== false) {
    enableLiveReload(Parcel);
  }

  for (const island of islands) {
    entryPoints[parse(island.fileName).name] = {
      path: new URL(
        join("file://", Deno.cwd(), island.filePath, island.fileName),
      ).href,
      isIsland: true,
    };
  }

  const bundler = new Bundler();
  const result = await bundler.bundle(entryPoints, options?.isProd);

  await createDirectory(packDirectory);
  await deleteDirectory(scriptsDirectory);
  await createDirectory(scriptsDirectory);

  // Write bundled scripts
  for (const [name, outputFile] of result.files) {
    await Deno.writeFile(join(scriptsDirectory, name), outputFile.contents);
    scripts.push([result.hash, name, {
      isEntryPoint: outputFile.isEntryPoint,
      isIsland: outputFile.isIsland,
      isRuntime: outputFile.isRuntime,
      imports: outputFile.imports.map((file) => file.path),
    }]);
  }

  try {
    const list = await createList({
      pagesList: pages,
      islandsList: islands,
      scriptsList: scripts,
      packDirectory,
    });

    await pack(
      Parcel,
      list,
    );

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
  } finally {
    bundler.stop();
  }
}

export async function createDirectory(path: string) {
  try {
    await Deno.mkdir(path);
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) {
      return;
    }
    throw e;
  }
}

export async function deleteDirectory(path: string) {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return;
    }
    throw e;
  }
}

export async function enableLiveReload<T extends CargoContext>(
  Parcel: ParcelApp<T>,
): Promise<ParcelApp<T>> {
  const bundler = new Bundler();
  const result = await bundler.bundle({
    "_live-reload": {
      path: new URL("../../browser/live-reload.ts", import.meta.url).href,
      isEntryPoint: true,
    },
  });

  const file = result.files.get("_live-reload.js");

  if (file) {
    Parcel.addScript(join(result.hash, parse(file.path).base), file.contents, {
      isEntryPoint: true,
      head: true,
    });
    Parcel.get("/_websocket", (ctx) => {
      if (ctx.request.headers.get("upgrade") === "websocket") {
        return Deno.upgradeWebSocket(ctx.request).response;
      }
      return new Response(
        `Websocket connection failed to upgrade. Have you set the header 'upgrade=websocket' properly?`,
        { status: 400 },
      );
    });
  }

  return Parcel;
}
