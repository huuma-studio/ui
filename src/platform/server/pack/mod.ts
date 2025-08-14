import { join } from "@std/path/join";
import { parseArgs } from "@std/cli/parse-args";
import type { Middleware } from "@huuma/route/middleware";
import { info, log } from "@huuma/route/utils/logger";
import type { AppContext } from "@huuma/route";
import type { PageLike, UIApp } from "../app.ts";
import type { JSX } from "../../../jsx-runtime/mod.ts";
import { Bundler, type EntryPoints } from "./bundler.ts";
import {
  createList,
  listIslands,
  listPages,
  remoteFunctionsList,
} from "./list.ts";
import {
  packIslands,
  packPages,
  packRemoteFunctions,
  packScripts,
} from "./pack.ts";
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
  remoteFunctions?: Record<
    string,
    // deno-lint-ignore no-explicit-any
    Record<string, (...args: any[]) => Promise<any>>
  >;
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

export async function prepare<T extends AppContext>(
  app: UIApp<T>,
): Promise<UIApp<T> | undefined> {
  if (!parseArgs(Deno.args).bundle) {
    await list(app, { isProd: false });
    return app;
  }

  await list(app, { isProd: true });
  log(
    "BUNDLE",
    '".pack" folder succesfully created.',
    "PARCEL",
  );
}

/**
 * Packs the application by adding pages, layouts, middleware, islands and scripts to the Huuma UI application.
 * This function takes a Huuma UI App instance and a List of pages and components, then configures the application
 * with the provided routes, layouts, middleware, and client-side components.
 *
 * @param {UIApp<T>} app - The UI application instance to pack
 * @param {List} list - Object containing pages, islands, and scripts to add to the application
 * @returns {Promise<UIApp<T>>} A promise that resolves with the configured Huuma UIApp instance
 */
export async function pack<T extends AppContext>(
  app: UIApp<T>,
  list: List,
): Promise<UIApp<T>> {
  const islandsScripts: List["scripts"] = [];
  const scripts: List["scripts"] = [];

  // Split islands and general scripts
  for (const script of list.scripts) {
    if (script[2].isIsland) {
      islandsScripts.push(script);
      continue;
    }
    scripts.push(script);
  }

  await packScripts(
    scripts,
    scriptsDirectory,
    app,
  );

  await packIslands(
    list.islands,
    islandsScripts,
    scriptsDirectory,
    app,
  );

  await packRemoteFunctions(
    list.remoteFunctions,
    app,
  );

  packPages(
    list.pages,
    app,
  );

  return app;
}

export async function list<T extends AppContext>(
  app: UIApp<T>,
  options?: {
    enableLiveReload?: boolean;
    isProd?: boolean;
  },
): Promise<UIApp<T>> {
  const pagesPath = "pages";

  const pages = await listPages(pagesPath);
  const islands = await listIslands("./");
  const remoteFunctions = await remoteFunctionsList("./");
  const scripts: List["scripts"] = [];

  const entryPoints: EntryPoints = {
    "huuma_ui_launch": {
      path: new URL("../../browser/mod.ts", import.meta.url).href,
      isRuntime: true,
    },
  };

  if (options?.enableLiveReload !== false) {
    enableLiveReload(app);
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
      remoteFunctionsList: remoteFunctions,
      packDirectory,
    });

    await pack(
      app,
      list,
    );

    return app;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      info(
        "PACK",
        `Could not find '${pagesPath}' directory while packaging the application. Please ensure it exists.`,
        "Huuma UI",
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

export async function enableLiveReload<T extends AppContext>(
  app: UIApp<T>,
): Promise<UIApp<T>> {
  const bundler = new Bundler();
  const result = await bundler.bundle({
    "_live-reload": {
      path: new URL("../../browser/live-reload.ts", import.meta.url).href,
      isEntryPoint: true,
    },
  });

  const file = result.files.get("_live-reload.js");

  if (file) {
    app.addScript(join(result.hash, parse(file.path).base), file.contents, {
      isEntryPoint: true,
      head: true,
    });
    app.get("/_websocket", (ctx) => {
      if (ctx.request.headers.get("upgrade") === "websocket") {
        return Deno.upgradeWebSocket(ctx.request).response;
      }
      return new Response(
        `Websocket connection failed to upgrade. Have you set the header 'upgrade=websocket' properly?`,
        { status: 400 },
      );
    });
  }

  return app;
}
