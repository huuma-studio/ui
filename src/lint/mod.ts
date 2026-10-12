/*
 * Huuma lint rules as a plain plugin object in the ESLint plugin format. The
 * same object loads in Oxlint (`jsPlugins`, e.g. through Vite+), in ESLint
 * flat config and in `deno lint` (`plugins`), so it imports nothing from any
 * of them.
 */

// The ESTree node shapes the rules read.
interface AstNode {
  type: string;
  async?: boolean;
  name?: string;
  exportKind?: string;
  declaration?: AstNode | null;
  declarations?: { id: AstNode; init?: AstNode | null }[];
  id?: AstNode | null;
  init?: AstNode | null;
}

interface RuleContext {
  filename: string;
  report(descriptor: { node: AstNode; message: string }): void;
}

interface Rule {
  meta: { type: "problem"; docs: { description: string } };
  create(context: RuleContext): Record<string, (node: AstNode) => void>;
}

/** A lint plugin for Oxlint, ESLint and `deno lint`. */
export interface LintPlugin {
  /** The plugin name for `deno lint`. */
  name: string;
  /** The plugin name for Oxlint and ESLint. */
  meta: { name: string };
  rules: Record<string, Rule>;
  /** ESLint flat config presets. */
  configs: Record<string, {
    plugins: Record<string, LintPlugin>;
    rules: Record<string, "error">;
  }>;
}

function isAsyncFunction(node: AstNode | null | undefined): boolean {
  return (
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "ArrowFunctionExpression"
  ) && !!node.async;
}

const TYPE_DECLARATIONS = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
]);

const asyncRemoteFunctions: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Remote function exports must be async functions." },
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        if (!context.filename.endsWith(".remote.ts")) return;
        // Types never reach the client.
        if (node.exportKind === "type") return;
        const declaration = node.declaration;
        if (declaration && TYPE_DECLARATIONS.has(declaration.type)) return;
        if (isAsyncFunction(declaration)) return;
        // `export const f = async () => {}`; the client stub generator does
        // not handle `export { f }` yet, so that is still reported.
        if (
          declaration?.type === "VariableDeclaration" &&
          declaration.declarations?.every((d) => isAsyncFunction(d.init))
        ) {
          return;
        }
        context.report({
          node,
          message: "Huuma remote function MUST be an async function export",
        });
      },
    };
  },
};

const noAsyncHookCalling: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Hooks ($-prefixed) must not run in async components." },
  },
  create(context) {
    return {
      "FunctionDeclaration[async=true] CallExpression > Identifier, ArrowFunctionExpression[async=true] CallExpression > Identifier, FunctionExpression[async=true] CallExpression > Identifier"(
        node,
      ) {
        if (node.name?.startsWith("$")) {
          context.report({
            node,
            message: "Huuma component hooks not allowed in async components",
          });
        }
      },
    };
  },
};

const noAsyncClientJsx: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Island components must not be async." },
  },
  create(context) {
    const message = "client-side does not support async jsx";
    const asyncFunctions = new Set<string>();
    return {
      VariableDeclarator(node) {
        if (!context.filename.endsWith("client.tsx")) return;
        if (
          node.init?.type === "ArrowFunctionExpression" &&
          node.init.async &&
          node.id?.type === "Identifier" &&
          node.id.name
        ) {
          asyncFunctions.add(node.id.name);
        }
      },
      ExportDefaultDeclaration(node) {
        if (!context.filename.endsWith("client.tsx")) return;
        const declaration = node.declaration;
        if (
          (declaration?.type === "ArrowFunctionExpression" ||
            declaration?.type === "FunctionDeclaration") &&
          declaration.async
        ) {
          context.report({ node, message });
        }
        if (
          declaration?.type === "Identifier" &&
          declaration.name &&
          asyncFunctions.has(declaration.name)
        ) {
          context.report({ node, message });
        }
      },
    };
  },
};

const plugin: LintPlugin = {
  name: "huuma",
  meta: { name: "huuma" },
  rules: {
    "async-remote-functions": asyncRemoteFunctions,
    "no-async-hook-calling": noAsyncHookCalling,
    "no-async-client-jsx": noAsyncClientJsx,
  },
  configs: {},
};

plugin.configs.recommended = {
  plugins: { huuma: plugin },
  rules: {
    "huuma/async-remote-functions": "error",
    "huuma/no-async-hook-calling": "error",
    "huuma/no-async-client-jsx": "error",
  },
};

export default plugin;
