import type { ESTree, Plugin } from "vite";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

import { listIslands } from "../platform/server/discover.ts";

/**
 * Every island module by the path the browser loads it from (without the
 * leading `/`, like `UIApp` script paths). Server only: the server needs
 * the components to find islands while rendering, and the paths for the
 * `Launch` script.
 */
export const ISLANDS_ID = "virtual:huuma/islands";

/**
 * The browser runtime (`launch`, and `hotReplaceIsland` for hot updates)
 * as a client module. Served by Vite like
 * the islands, so both import `@huuma/ui` through the same (optimized)
 * modules and share one signal runtime.
 */
export const RUNTIME_ID = "virtual:huuma/runtime";
const RESOLVED_RUNTIME_ID = `\0${RUNTIME_ID}`;

export interface IslandsOptions {
  /** Vite's resolved `root`: islands are discovered below it. */
  root: string;
  /** Vite's resolved `base`, which the browser paths start with. */
  base: string;
}

// An island module, e.g. `app/counter.client.tsx`, with an optional query.
const ISLAND_MODULE = /\.client\.tsx(\?.*)?$/;

/**
 * Serves `virtual:huuma/islands` (server) and `virtual:huuma/runtime`
 * (client). In the dev server, island modules accept their own hot
 * updates: the runtime replaces the component in the page's islands,
 * which start over with their initial state.
 */
export function islandsPlugin(options: () => IslandsOptions): Plugin {
  return {
    name: "huuma:islands",
    transform: {
      filter: { id: { include: ISLAND_MODULE, exclude: /[\\/]node_modules[\\/]/ } },
      handler(code) {
        if (this.environment.config.consumer !== "client" || this.environment.mode !== "dev") {
          return;
        }
        return { code: code + hotUpdate(hookSignature(this.parse(code), code)), map: null };
      },
    },
    resolveId: {
      filter: { id: new RegExp(`^(${ISLANDS_ID}|${RUNTIME_ID})$`) },
      handler(id) {
        return `\0${id}`;
      },
    },
    load: {
      filter: { id: new RegExp(`^\0(${ISLANDS_ID}|${RUNTIME_ID})$`) },
      async handler(id) {
        const consumer = this.environment.config.consumer;
        if (id === RESOLVED_RUNTIME_ID) {
          if (consumer !== "client") this.error(`${RUNTIME_ID} is the browser runtime.`);
          return {
            code: 'export { hotReplaceIsland, launch } from "@huuma/ui/browser";\n',
            moduleType: "js",
          };
        }
        if (consumer !== "server") {
          this.error(`${ISLANDS_ID} imports every island for the server and is server only.`);
        }
        const { root, base } = options();
        const islands = (await listIslands(root)).map((island) => {
          const file = join(island.filePath, island.fileName);
          return { name: island.name, file, path: islandPath(root, base, file) };
        });
        return { code: islandsModule(islands), moduleType: "js" };
      },
    },
  };
}

/**
 * Appended to island modules in the dev server. The runtime finds the
 * page's islands by the module's browser path; if it can't replace the
 * component (or the new module has none), Vite reloads the page.
 *
 * Each version stores its hook signature in `import.meta.hot.data`, which
 * all versions of a module share. When the previous version's accept
 * callback runs, the new version has already stored its signature: if
 * they're equal, the islands keep their state.
 */
function hotUpdate(signature: string): string {
  return `
import { hotReplaceIsland as $huuma$hotReplaceIsland } from "${RUNTIME_ID}";
if (import.meta.hot) {
  const hooks = ${JSON.stringify(signature)};
  import.meta.hot.data.hooks = hooks;
  import.meta.hot.accept((next) => {
    const path = new URL(import.meta.url).pathname;
    const keepState = import.meta.hot.data.hooks === hooks;
    if (
      typeof next?.default !== "function" ||
      !$huuma$hotReplaceIsland(path, next.default, { keepState })
    ) {
      import.meta.hot.invalidate("Huuma can't replace this island in place.");
    }
  });
}
`;
}

/**
 * A hash of the hook calls in a module (calls of `$`-prefixed functions,
 * like `$signal(0)`, also through a namespace, like `hooks.$signal(0)`,
 * or imported under another name), in order and with their arguments. An
 * island keeps its state over a hot update only if it's unchanged: hooks
 * keep their values by call order, and a `$computed` or `$effect` keeps
 * the function it was created with.
 */
export function hookSignature(program: ESTree.Program, code: string): string {
  const hooks = importedHooks(program);
  const calls: string[] = [];
  const pending: unknown[] = [program];
  while (pending.length) {
    // A stack, children pushed in reverse: calls come out in source order.
    const node = pending.pop();
    if (Array.isArray(node)) {
      pending.push(...[...node].reverse());
    } else if (node && typeof node === "object") {
      const { type, callee, start, end } = node as {
        type?: string;
        callee?: ESTree.Expression;
        start: number;
        end: number;
      };
      if (type === "CallExpression" && callee && isHook(callee, hooks)) {
        calls.push(code.slice(start, end));
      }
      const children = Object.values(node).filter((child) => child && typeof child === "object");
      pending.push(...children.reverse());
    }
  }
  return createHash("sha256").update(calls.join("\n")).digest("hex").slice(0, 16);
}

// The local names of `$`-prefixed imports, e.g. `signal` for
// `import { $signal as signal } from "@huuma/ui/hooks/signal"`.
function importedHooks(program: ESTree.Program): Set<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    for (const specifier of statement.specifiers) {
      if (
        specifier.type === "ImportSpecifier" &&
        isHookName(moduleExportName(specifier.imported))
      ) {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

// `$signal(…)`, `signal(…)` if imported as `$signal`, `hooks.$signal(…)`
// and `hooks["$signal"](…)`.
function isHook(callee: ESTree.Expression, hooks: Set<string>): boolean {
  if (callee.type === "Identifier") return isHookName(callee.name) || hooks.has(callee.name);
  if (callee.type === "MemberExpression") {
    const { property } = callee;
    if (!callee.computed) return property.type === "Identifier" && isHookName(property.name);
    return (
      property.type === "Literal" &&
      typeof property.value === "string" &&
      isHookName(property.value)
    );
  }
  return false;
}

function isHookName(name: string): boolean {
  return name.startsWith("$");
}

function moduleExportName(name: ESTree.ModuleExportName): string {
  return name.type === "Identifier" ? name.name : String(name.value);
}

/** Generates the source of `virtual:huuma/islands`. */
export function islandsModule(islands: { name: string; file: string; path: string }[]): string {
  return [
    ...islands.map(
      ({ name, file }) => `import * as ${name} from ${JSON.stringify(file.replaceAll("\\", "/"))};`,
    ),
    "",
    "export default {",
    ...islands.map(({ name, path }) => `  ${JSON.stringify(path)}: ${name},`),
    "};",
    "",
  ].join("\n");
}

/**
 * The path the browser loads an island file from, e.g.
 * `app/counter.client.tsx`. Each segment is URL-encoded: a raw `%` or `?`
 * in a directory name would change the URL. (`#` doesn't work either way:
 * Vite can't load files with `#` in their path.)
 */
export function islandPath(root: string, base: string, file: string): string {
  const segments = relative(root, file).split(/[\\/]/).map(encodeURIComponent);
  return withoutLeadingSlash(base + segments.join("/"));
}

/**
 * The path the browser loads the runtime from. Vite serves a virtual
 * module at `/@id/` plus its id, with the leading `\0` as `__x00__`.
 */
export function runtimePath(base: string): string {
  return withoutLeadingSlash(`${base}@id/__x00__${RUNTIME_ID}`);
}

function withoutLeadingSlash(path: string): string {
  return path.replace(/^\//, "");
}
