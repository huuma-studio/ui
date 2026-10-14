import { join } from "node:path";
import { EOL } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import type { List } from "../mod.ts";
import { isNodeError } from "../../utils.ts";
import type { FileImport, Page, Routes } from "../../discover.ts";

export type { FileImport } from "../../discover.ts";
export { listIslands, listPages, listRemoteFunctions, sortPages } from "../../discover.ts";

export interface Pack extends Routes {
  islands: FileImport[];
  scripts: List["scripts"];
  remoteFunctions: FileImport[];
}

type CreateListOptions = {
  huumaDirectory: string;
  pagesList: Routes;
  islandsList: FileImport[];
  scriptsList: List["scripts"];
  remoteFunctionsList: FileImport[];
};

export async function createList({
  pagesList,
  islandsList,
  scriptsList,
  remoteFunctionsList,
  huumaDirectory,
}: CreateListOptions): Promise<List> {
  return (
    await import(
      join(
        "file://",
        process.cwd(),
        await writeListFrom(
          {
            pages: pagesList.pages,
            layouts: pagesList.layouts,
            middlewares: pagesList.middlewares,
            islands: islandsList,
            scripts: scriptsList,
            remoteFunctions: remoteFunctionsList,
          },
          huumaDirectory,
        ),
      )
    )
  ).default;
}

/**
 * @internal Not part of the public `@huuma/ui` API. Exported only for
 * unit-testing; `list/mod.ts` does not re-export it.
 *
 * Writes the generated `list.ts` into `packPath` and returns its path. The
 * file is only rewritten when its content changed.
 */
export async function writeListFrom(pack: Pack, packPath: string): Promise<string> {
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
    ...(pack.middlewares.length ? [imports(pack.middlewares, "Middleware")] : []),
    ...(pack.islands.length ? [imports(pack.islands, "Islands")] : []),
    ...(pack.remoteFunctions.length ? [imports(pack.remoteFunctions, "Remote Functions")] : []),
    ...(pack.pages.length
      ? [
          "",
          "export default {",
          ...(pack.pages.length ? ["  pages: {", pagesExports(pack.pages), "  },"] : []),
          ...(pack.islands.length ? ["  islands: {", fileExports(pack.islands), "  },"] : []),
          ...(pack.remoteFunctions.length
            ? ["  remoteFunctions: {", fileExports(pack.remoteFunctions), "  },"]
            : []),
          [
            "  scripts: [",
            pack.scripts
              .map((script) => `    ["${script[0]}","${script[1]}",${JSON.stringify(script[2])}]`)
              .join(`,${EOL}`),
            "  ]",
          ].join(EOL),
          "} as List;",
        ]
      : []),
  ].join(EOL);

  const packFilePath = join(packPath, "list.ts");
  try {
    const existingManifest = await readFile(packFilePath, "utf8");
    if (existingManifest !== content) {
      await writeFile(packFilePath, content);
    }
  } catch (e) {
    if (isNodeError(e, "ENOENT")) {
      await writeFile(packFilePath, content);
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
  return files
    .map((file) => `    "${join(file.filePath, file.fileName)}": ${file.name},`)
    .join(EOL);
}
