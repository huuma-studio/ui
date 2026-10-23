import { dirname, join } from "node:path";
import { readdir } from "node:fs/promises";

// File-system discovery of pages, layouts, middlewares, islands and remote
// functions, for the Vite plugin (`src/vite`); not an entry point in
// `deno.json`'s exports map.

export interface FileImport {
  name: string;
  filePath: string;
  fileName: string;
}

export interface Page {
  page: FileImport & { routePath: string };
  layouts: string[];
  middlewares: string[];
}

/** The pages of a routes directory with the layouts and middlewares they use. */
export interface Routes {
  pages: Page[];
  layouts: FileImport[];
  middlewares: FileImport[];
}

/**
 * Yields the files below `root` whose path matches one of `patterns`, depth
 * first in directory order, like `walk()` from @std/fs: island and remote
 * function names follow this order.
 *
 * Skips `node_modules` and hidden directories (`.git`, `.huuma`, `.vite`):
 * islands are discovered across the whole project, and a Vite app's root
 * contains its dependencies.
 */
async function* walkFiles(
  root: string,
  patterns: RegExp[],
): AsyncGenerator<{ path: string; name: string }> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      yield* walkFiles(path, patterns);
    } else if (patterns.some((pattern) => pattern.test(path))) {
      yield { path, name: entry.name };
    }
  }
}

export async function listPages(path: string): Promise<Routes> {
  let pages: FileImport[] = [];
  let layouts: FileImport[] = [];
  let middlewares: FileImport[] = [];

  let layoutIndex = 0;
  let pageIndex = 0;
  let middlewareIndex = 0;

  const paths: FileImport[] = [];

  for await (const file of walkFiles(path, [
    /(page\.tsx)$/,
    /(layout\.tsx)$/,
    /(middleware\.ts)$/,
  ])) {
    if (/\/(layout\.tsx)$/.exec(file.path)?.length) {
      paths.push({
        name: "_",
        filePath: file.path,
        fileName: file.name,
      });
      layouts.push({
        name: `L${layoutIndex}`,
        filePath: dirname(file.path),
        fileName: file.name,
      });
      layoutIndex++;
    }
    if (/\/(page\.tsx)$/.exec(file.path)?.length) {
      pages.push({
        name: `P${pageIndex}`,
        filePath: dirname(file.path),
        fileName: file.name,
      });
      pageIndex++;
    }
    if (/\/(middleware\.ts)$/.exec(file.path)?.length) {
      middlewares.push({
        name: `M${middlewareIndex}`,
        filePath: dirname(file.path),
        fileName: file.name,
      });
      middlewareIndex++;
    }
  }

  pages = sortPages(pages, path);
  layouts = sortImports(layouts);
  middlewares = sortImports(middlewares);

  const pageRecords: Page[] = pages.map((page) => {
    const pageLayouts = layouts
      .filter((layout) => {
        return page.filePath.startsWith(layout.filePath);
      })
      .map((layout) => {
        return layout.name;
      });

    const pageMiddlewares = middlewares
      .filter((middleware) => {
        return page.filePath.startsWith(middleware.filePath);
      })
      .map((middleware) => {
        return middleware.name;
      });

    return {
      page: {
        ...page,
        routePath: removeGroupFrom(removePathFrom(page.filePath, path)) || "/",
      },
      layouts: pageLayouts,
      middlewares: pageMiddlewares,
    };
  });

  return {
    pages: pageRecords,
    layouts: sortImports(layouts),
    middlewares: sortImports(middlewares),
  };
}

export async function listIslands(path: string): Promise<FileImport[]> {
  const islands: FileImport[] = [];
  let i = 0;

  for await (const file of walkFiles(path, [/(.+\.client\.tsx)$/])) {
    islands.push({
      filePath: dirname(file.path),
      fileName: file.name,
      name: `I${i}`,
    });
    i++;
  }
  return islands;
}

export async function listRemoteFunctions(path: string): Promise<FileImport[]> {
  const remoteFunctions: FileImport[] = [];
  let i = 0;

  for await (const file of walkFiles(path, [/(.+\.remote\.ts)$/])) {
    remoteFunctions.push({
      filePath: dirname(file.path),
      fileName: file.name,
      name: `A${i}`,
    });
    i++;
  }

  return remoteFunctions;
}

/**
 * Sorts pages so the root page (filePath === basePath) is registered first
 * and the `!404` catch-all is registered last. The router resolves
 * first-match-wins, so registration order determines which route wins
 * when patterns overlap (e.g. `/` vs `/*`).
 */
export function sortPages(imports: FileImport[], basePath?: string): FileImport[] {
  // Compared with the lowercased paths below: a routes path with capitals
  // (e.g. an absolute path under /Users) must still find the root page.
  const base = basePath?.toLowerCase();
  return imports.sort((a, b) => {
    const al = a.filePath.toLowerCase();
    const bl = b.filePath.toLowerCase();

    // The root page (filePath === basePath) must always sort first so it is
    // registered before the `!404` catch-all (`/*`). The comparator must be
    // antisymmetric: checking only `a` (the previous form) left the result
    // dependent on the initial array order from `walk()`, which is
    // filesystem-dependent — so the root page "randomly" ended up after the
    // catch-all and `/` returned 404.
    if (typeof base !== "undefined") {
      if (al === base) return -1;
      if (bl === base) return 1;
    }

    if (al > bl) {
      return -1;
    } else if (al == bl) {
      return 0;
    }
    return 1;
  });
}

function sortImports(imports: FileImport[]) {
  return [...imports].sort((a, b) => {
    // Split paths by '/' to determine nesting level
    const aSegments = a.filePath.split("/");
    const bSegments = b.filePath.split("/");

    // Compare nesting level first (inverted)
    if (aSegments.length !== bSegments.length) {
      return bSegments.length - aSegments.length;
    }

    // If same nesting level, compare each path segment
    for (let i = 0; i < aSegments.length; i++) {
      const aSegment = aSegments[i];
      const bSegment = bSegments[i];

      // If both are the same type (both static or both dynamic), compare alphabetically (inverted)
      if (aSegment !== bSegment) {
        return bSegment.localeCompare(aSegment);
      }
    }

    // If we get here, the paths are identical
    return 0;
  });
}

function removeGroupFrom(route: string): string {
  return route.replace(/\/\([\w-]+\)/g, "");
}

function removePathFrom(route: string, path: string): string {
  return route.replace(path, "");
}
