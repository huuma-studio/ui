import { info, log } from "@huuma/route/utils/logger";
import { parseArgs } from "@std/cli/parse-args";
import type { AppContext } from "@huuma/route";
import { parse } from "@std/path/parse";
import { join } from "@std/path/join";

import {
  huumaDirectory,
  type List,
  pack,
  scriptsDirectory,
  shimsDirectory,
} from "../mod.ts";
import type { EntryPoints } from "./bundler.ts";
import { Bundler } from "./bundler.ts";
import type { UIApp } from "../../mod.ts";
import {
  createList,
  listIslands,
  listPages,
  listRemoteFunctions,
} from "./list.ts";

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
    `"${huumaDirectory}" folder succesfully created.`,
    "PARCEL",
  );
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
  const remoteFunctions = await listRemoteFunctions("./");
  const scripts: List["scripts"] = [];

  const entryPoints: EntryPoints = {
    "huuma_ui_launch": {
      path: new URL("../../../browser/mod.ts", import.meta.url).href,
      isRuntime: true,
    },
  };

  for (const [name, path] of app.getEntryPoints()) {
    entryPoints[name] = {
      path,
      isEntryPoint: true,
    };
  }

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

  await createDirectory(huumaDirectory);

  const bundler = new Bundler();
  const result = await bundler.bundle({
    entryPoints,
    isProd: options?.isProd,
    shims: [await shimPublicEnvVars()],
  });

  await deleteDirectory(shimsDirectory);
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
      huumaDirectory,
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
    await bundler.stop();
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

export async function shimPublicEnvVars(): Promise<string> {
  const filePath = `./${shimsDirectory}/deno-env-shim.js`;
  const envVars = Object.entries(Deno.env.toObject());
  const define: Record<string, string> = {};

  envVars.forEach(([key, value]) => {
    if (key.startsWith("PUBLIC_")) {
      define[key] = value;
    }
  });

  await createDirectory(`${shimsDirectory}`);
  await Deno.writeTextFile(
    `./${huumaDirectory}/shims/deno-env-shim.js`,
    `export const Deno = {env: { get:(key) => (${
      JSON.stringify(define)
    })[key]}}`,
  );
  return filePath;
}

export async function enableLiveReload<T extends AppContext>(
  app: UIApp<T>,
): Promise<UIApp<T>> {
  const bundler = new Bundler();
  const result = await bundler.bundle({
    entryPoints: {
      "_live-reload": {
        path: new URL("../../../browser/live-reload.ts", import.meta.url).href,
        isEntryPoint: true,
      },
    },
  });

  await bundler.stop();

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
