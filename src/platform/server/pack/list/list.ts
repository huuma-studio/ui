import { dirname } from "@std/path/dirname";
import { join } from "@std/path/join";
import { walk } from "@std/fs/walk";
import { EOL } from "@std/fs/eol";
import type { List } from "../mod.ts";

interface FileImport {
  name: string;
  filePath: string;
  fileName: string;
}

interface Page {
  page: FileImport & { routePath: string };
  layouts: string[];
  middlewares: string[];
}

interface Pack {
  pages: Page[];
  layouts: FileImport[];
  middlewares: FileImport[];
  islands: FileImport[];
  scripts: List["scripts"];
  remoteFunctions: FileImport[];
}

type CreateListOptions = {
  packDirectory: string;
  pagesList: Omit<Pack, "islands" | "scripts" | "remoteFunctions">;
  islandsList: FileImport[];
  scriptsList: List["scripts"];
  remoteFunctionsList: FileImport[];
};

export async function createList(
  { pagesList, islandsList, scriptsList, remoteFunctionsList, packDirectory }:
    CreateListOptions,
): Promise<List> {
  return (
    await import(
      join(
        "file://",
        Deno.cwd(),
        await writeListFrom(
          {
            pages: pagesList.pages,
            layouts: pagesList.layouts,
            middlewares: pagesList.middlewares,
            islands: islandsList,
            scripts: scriptsList,
            remoteFunctions: remoteFunctionsList,
          },
          packDirectory,
        ),
      )
    )
  ).default;
}

export async function listPages(
  path: string,
): Promise<Omit<Pack, "islands" | "scripts" | "remoteFunctions">> {
  let pages: FileImport[] = [];
  let layouts: FileImport[] = [];
  let middlewares: FileImport[] = [];

  let layoutIndex = 0;
  let pageIndex = 0;
  let middlewareIndex = 0;

  const paths: FileImport[] = [];

  for await (
    const file of walk(path, {
      match: [/(page\.tsx)$/, /(layout\.tsx)$/, /(middleware\.ts)$/],
    })
  ) {
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

  for await (
    const file of walk(path, {
      includeDirs: false,
      match: [/(.+\.client\.tsx)$/],
    })
  ) {
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

  for await (
    const file of walk(path, {
      includeDirs: false,
      match: [/(.+\.remote\.ts)$/],
    })
  ) {
    remoteFunctions.push({
      filePath: dirname(file.path),
      fileName: file.name,
      name: `A${i}`,
    });
    i++;
  }

  return remoteFunctions;
}

async function writeListFrom(pack: Pack, packPath: string): Promise<string> {
  const content = [
    "// Huuma UI generated code - Do not modify!",
    ...(pack.pages.length
      ? [
        'import type { List } from "@huuma/ui/server/pack";',
        imports(
          pack.pages.map((page) => page.page),
          "Page",
        ),
      ]
      : []),
    ...(pack.layouts.length ? [imports(pack.layouts, "Layout")] : []),
    ...(pack.middlewares.length
      ? [imports(pack.middlewares, "Middleware")]
      : []),
    ...(pack.islands.length ? [imports(pack.islands, "Islands")] : []),
    ...(pack.remoteFunctions.length
      ? [imports(pack.remoteFunctions, "Remote Functions")]
      : []),
    ...(pack.pages.length
      ? [
        "",
        "export default {",
        ...(pack.pages.length
          ? ["  pages: {", pagesExports(pack.pages), "  },"]
          : []),
        ...(pack.islands.length
          ? ["  islands: {", fileExports(pack.islands), "  },"]
          : []),
        ...(pack.remoteFunctions.length
          ? ["  remoteFunctions: {", fileExports(pack.remoteFunctions), "  },"]
          : []),
        [
          "  scripts: [",
          pack.scripts.map((script) =>
            `    ["${script[0]}","${script[1]}",${JSON.stringify(script[2])}]`
          ).join(
            `,${EOL}`,
          ),
          "  ]",
        ].join(EOL),
        "} as List;",
      ]
      : []),
  ].join(EOL);

  const packFilePath = join(packPath, "list.ts");
  try {
    const existingManifest = await Deno.readTextFile(packFilePath);
    if (existingManifest !== content) {
      await Deno.writeTextFile(packFilePath, content);
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      await Deno.writeTextFile(packFilePath, content);
    } else {
      throw e;
    }
  }
  return packFilePath;
}

function imports(entries: FileImport[], type: string): string {
  return entries.length
    ? [
      `// ${type} imports`,
      ...entries.map((entry) => {
        return `import * as ${entry.name} from "../${entry.filePath}/${entry.fileName}";`;
      }),
    ].join(EOL)
    : "";
}

function pagesExports(pages: Page[]): string {
  return pages
    .map((page) => {
      return `    "${page.page.routePath}": {
      page: ${page.page.name},
      layouts: [${page.layouts.join()}],
      middleware: [${page.middlewares.reverse().join()}]
    },`;
    })
    .join(EOL);
}

function fileExports(files: FileImport[]): string {
  return files.map(
    (file) => `    "${join(file.filePath, file.fileName)}": ${file.name},`,
  ).join(EOL);
}

function sortPages(imports: FileImport[], basePath?: string): FileImport[] {
  return imports.sort((a, b) => {
    const al = a.filePath.toLowerCase();
    const bl = b.filePath.toLowerCase();

    if (typeof basePath !== "undefined" && al === basePath) {
      return -1;
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
