import { info, log } from "@huuma/route/utils/logger";
import { parseArgs } from "@std/cli/parse-args";
import { parse } from "@std/path/parse";
import { join } from "@std/path/join";
import { mkdir, rm, writeFile } from "node:fs/promises";
import process from "node:process";

import type { UIAppContext } from "../../app.ts";
import type { UIApp } from "../../mod.ts";
import {
  huumaDirectory,
  type List,
  pack,
  scriptsDirectory,
  shimsDirectory,
} from "../mod.ts";

import type { EntryPoints } from "./bundler.ts";
import { Bundler } from "./bundler.ts";
import {
  createList,
  listIslands,
  listPages,
  listRemoteFunctions,
} from "./list.ts";
import { generateHash, isNodeError } from "./utils.ts";

export interface PrepareOptions {
  routesPath?: string;
}
export async function prepare<T extends UIAppContext>(
  app: UIApp<T>,
  { routesPath }: PrepareOptions = {},
): Promise<UIApp<T> | undefined> {
  if (!parseArgs(process.argv.slice(2)).bundle) {
    await list(app, { isProd: false });
    return app;
  }

  await list(app, { isProd: true, routesPath });
  log(
    "BUNDLE",
    `"${huumaDirectory}" folder succesfully created.`,
    "Huuma/Task",
  );
}

export async function list<T extends UIAppContext>(
  app: UIApp<T>,
  options?: {
    enableLiveReload?: boolean;
    isProd?: boolean;
    routesPath?: string;
  },
): Promise<UIApp<T>> {
  const routesPath = options?.routesPath ?? "app";

  const pages = await listPages(routesPath);
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
    await enableLiveReload(app);
  }

  for (const island of islands) {
    entryPoints[
      `${await generateHash(join(island.filePath, island.fileName))}-${
        parse(island.fileName).name
      }`
    ] = {
      path: new URL(
        join("file://", process.cwd(), island.filePath, island.fileName),
      ).href,
      isIsland: true,
    };
  }

  await createDirectory(huumaDirectory);

  const bundler = new Bundler();
  const { files, hash } = await bundler.bundle({
    entryPoints,
    isProd: options?.isProd,
    shims: [await shimPublicEnvVars()],
  });

  await deleteDirectory(shimsDirectory);
  await deleteDirectory(scriptsDirectory);
  await createDirectory(scriptsDirectory);

  // Write bundled scripts
  for (const [name, outputFile] of files) {
    await writeFile(join(scriptsDirectory, name), outputFile.contents);
    scripts.push([hash, name, {
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
    if (isNodeError(e, "ENOENT")) {
      info(
        "PACK",
        `Could not find '${routesPath}' directory while packaging the application. Please ensure it exists.`,
        "Huuma UI",
      );
    }
    throw e;
  } finally {
    await bundler.stop();
  }
}

export async function createDirectory(path: string) {
  await mkdir(path, { recursive: true });
}

export async function deleteDirectory(path: string) {
  await rm(path, { recursive: true, force: true });
}

export async function shimPublicEnvVars(): Promise<string> {
  const filePath = `./${shimsDirectory}/deno-env-shim.js`;
  const envVars = Object.entries(process.env);
  const define: Record<string, string> = {};

  envVars.forEach(([key, value]) => {
    if (key.startsWith("PUBLIC_") && value !== undefined) {
      define[key] = value;
    }
  });

  await createDirectory(`${shimsDirectory}`);
  await writeFile(
    `./${huumaDirectory}/shims/deno-env-shim.js`,
    `export const Deno = {env: { get:(key) => (${
      JSON.stringify(define)
    })[key]}}`,
  );
  return filePath;
}

export async function enableLiveReload<T extends UIAppContext>(
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
