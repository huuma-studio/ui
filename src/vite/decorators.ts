import type { ESTree, Plugin } from "vite";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Which modules get their decorators lowered: `"auto"` (the default) for
 * every module with standard decorators, unless the app turned on Oxc's
 * legacy (`experimentalDecorators`) ones; `true` always; `false` never.
 */
export type DecoratorsOption = "auto" | boolean;

// The Babel API the plugin uses. Typed locally: Babel is an optional
// dependency of the app, not of this package.
interface Babel {
  transformAsync(
    code: string,
    options: Record<string, unknown>,
  ): Promise<{ code?: string | null; map?: unknown } | null>;
}

const BABEL = "@babel/core";
const DECORATORS = "@babel/plugin-proposal-decorators";

// Defines `Symbol.metadata` where the runtime lacks it (Node; Deno and
// some browsers have it), with the symbol Babel's helpers fall back to, so
// decorator metadata (`context.metadata`) can be read with it.
const SYMBOL_METADATA = 'Symbol.metadata ??= Symbol.for("Symbol.metadata");';

/**
 * Lowers standard (TC39, 2023-11) decorators with Babel, which Oxc doesn't
 * do yet, in the client and ssr environments. `@huuma/inject` needs them.
 *
 * Only modules with decorators go through Babel: the transform runs on
 * code with an `@`, and Oxc's parser then checks for decorators.
 * `node_modules` is skipped. Babel is loaded from the app's dependencies
 * on the first module that needs it, with an install hint if it's
 * missing. Decorated modules also define `Symbol.metadata` if needed.
 */
export function decoratorsPlugin(option: () => DecoratorsOption, root: () => string): Plugin {
  let enabled = false;
  let babel: Promise<{ babel: Babel; decorators: unknown }> | undefined;
  return {
    name: "huuma:decorators",
    // On the TypeScript source, before Oxc compiles it.
    enforce: "pre",
    configResolved(config) {
      const decorators = option();
      const legacy = !!(config.oxc && config.oxc.decorator?.legacy);
      enabled = decorators === true || (decorators === "auto" && !legacy);
    },
    transform: {
      filter: {
        id: { include: /\.[cm]?[jt]sx?(\?.*)?$/, exclude: /[\\/]node_modules[\\/]/ },
        code: "@",
      },
      async handler(code, id) {
        if (!enabled) return;
        const file = id.replace(/\?.*$/, "");
        if (!hasDecorators(this.parse(code, { lang: language(file) }))) return;

        babel ??= loadBabel(root());
        const { babel: core, decorators } = await babel;
        const result = await core.transformAsync(code, {
          filename: file,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          parserOpts: { plugins: file.endsWith("x") ? ["typescript", "jsx"] : ["typescript"] },
          plugins: [[decorators, { version: "2023-11" }]],
        });
        if (!result?.code) return;
        return {
          // On the first line, so Babel's source map stays valid for the rest.
          code: SYMBOL_METADATA + result.code,
          map: result.map as { mappings: string },
        };
      },
    },
  };
}

/** Loads Babel and its decorators plugin from the app's dependencies. */
async function loadBabel(root: string): Promise<{ babel: Babel; decorators: unknown }> {
  const require = createRequire(join(root, "package.json"));
  const load = async (name: string) => {
    try {
      return (await import(pathToFileURL(require.resolve(name)).href)) as {
        default?: unknown;
      };
    } catch {
      throw new Error(
        `Decorators need ${BABEL} and ${DECORATORS} in the app's dependencies: ` +
          `\`pnpm add -D ${BABEL} ${DECORATORS}\` (or npm/yarn). ` +
          "To leave decorators alone, set `huuma({ decorators: false })`.",
      );
    }
  };
  const [babel, decorators] = await Promise.all([load(BABEL), load(DECORATORS)]);
  return { babel: babel as unknown as Babel, decorators: decorators.default };
}

function language(file: string): "js" | "jsx" | "ts" | "tsx" {
  if (/\.[cm]?tsx$/.test(file)) return "tsx";
  if (/\.[cm]?ts$/.test(file)) return "ts";
  if (/\.[cm]?jsx$/.test(file)) return "jsx";
  return "js";
}

/** Whether an AST has a decorator anywhere. */
export function hasDecorators(node: ESTree.Node | ESTree.Program): boolean {
  const pending: unknown[] = [node];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
    } else if (value && typeof value === "object") {
      if ((value as { type?: string }).type === "Decorator") return true;
      for (const child of Object.values(value)) {
        if (child && typeof child === "object") pending.push(child);
      }
    }
  }
  return false;
}
