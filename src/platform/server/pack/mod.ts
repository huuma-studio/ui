import type { Middleware } from "@huuma/route/middleware";
import type { AppContext } from "@huuma/route";
import { join } from "@std/path/join";

import type {
  Metadata,
  MetadataGenerator,
  PageLike,
  Resolver,
  UIApp,
} from "../app.ts";
import type { JSX } from "../../../jsx-runtime/mod.ts";

import {
  packIslands,
  packPages,
  packRemoteFunctions,
  packScripts,
} from "./pack.ts";

export type PageRoute = {
  page: Renderable;
  layouts: Renderable[];
  middleware: { default: Middleware[] }[];
};

type Renderable = {
  default: PageLike<unknown>;
  metadata?: Metadata | MetadataGenerator<unknown>;
  resolver?: Resolver<unknown>;
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

export const huumaDirectory: string = ".huuma";
export const scriptsDirectory: string = join(huumaDirectory, "scripts");
export const shimsDirectory: string = join(huumaDirectory, "shims");

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
