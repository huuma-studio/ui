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
  generator?: boolean;
  name?: string;
  exportKind?: string;
  importKind?: string;
  declaration?: AstNode | null;
  id?: AstNode | null;
  init?: AstNode | null;
  expression?: AstNode | null;
  body?: AstNode[] | AstNode | null;
  declarations?: AstNode[];
  specifiers?: AstNode[];
  local?: AstNode;
  source?: AstNode | null;
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
  configs: Record<
    string,
    {
      plugins: Record<string, LintPlugin>;
      rules: Record<string, "error">;
    }
  >;
}

const TYPE_DECLARATIONS = new Set(["TSTypeAliasDeclaration", "TSInterfaceDeclaration"]);
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
// Wrappers that don't change the value: `(async () => {}) satisfies Handler`.
const TRANSPARENT = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "ParenthesizedExpression",
]);

function isAsyncFunction(node: AstNode | null | undefined): boolean {
  while (node && TRANSPARENT.has(node.type)) node = node.expression;
  return !!node && FUNCTIONS.has(node.type) && !!node.async && !node.generator;
}

/** What a top-level name of a remote module is bound to. */
type Binding = "async-function" | "import" | "type" | "other";

function bindings(program: AstNode): Map<string, Binding> {
  const names = new Map<string, Binding>();
  const statements = Array.isArray(program.body) ? program.body : [];
  for (const statement of statements) {
    // `export const f = …` binds `f` as well.
    const node = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (!node) continue;
    if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers ?? []) {
        const type = node.importKind === "type" || specifier.importKind === "type";
        if (specifier.local?.name) names.set(specifier.local.name, type ? "type" : "import");
      }
    } else if (TYPE_DECLARATIONS.has(node.type)) {
      // A type can share its name with a value, which is what's exported.
      if (node.id?.name && !names.has(node.id.name)) names.set(node.id.name, "type");
    } else if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      if (node.id?.name)
        names.set(node.id.name, isAsyncFunction(node) ? "async-function" : "other");
    } else if (node.type === "VariableDeclaration") {
      for (const declarator of node.declarations ?? []) {
        if (declarator.id?.type === "Identifier" && declarator.id.name) {
          names.set(
            declarator.id.name,
            isAsyncFunction(declarator.init) ? "async-function" : "other",
          );
        }
      }
    }
  }
  return names;
}

const asyncRemoteFunctions: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Remote function exports must be async functions." },
  },
  create(context) {
    const message = "Huuma remote function MUST be an async function export";
    return {
      // Every value export becomes a browser stub that calls the server
      // (`remoteExports()` in the Vite plugin), so each must be an async
      // function. What another module exports can't be checked here.
      Program(program) {
        if (!context.filename.endsWith(".remote.ts")) return;
        const names = bindings(program);
        const statements = Array.isArray(program.body) ? program.body : [];
        for (const node of statements) {
          if (node.type === "ExportAllDeclaration") {
            if (node.exportKind === "type") continue;
            context.report({
              node,
              message:
                "Huuma remote modules can't use `export *`: export each remote function by name",
            });
          }
          // The default export is a remote function too, named `default`.
          if (node.type === "ExportDefaultDeclaration") {
            let declaration = node.declaration;
            if (declaration?.type === "TSInterfaceDeclaration") continue;
            // An overload signature: the implementation is checked.
            if (declaration?.type === "TSDeclareFunction") continue;
            while (declaration && TRANSPARENT.has(declaration.type)) {
              declaration = declaration.expression;
            }
            // `export default save` is checked like `export { save }`.
            const binding =
              declaration?.type === "Identifier" ? names.get(declaration.name ?? "") : undefined;
            const valid =
              declaration?.type === "Identifier"
                ? binding !== undefined && binding !== "other"
                : isAsyncFunction(declaration);
            if (!valid) context.report({ node, message });
            continue;
          }
          if (node.type !== "ExportNamedDeclaration") continue;
          // Types never reach the client.
          if (node.exportKind === "type") continue;
          const declaration = node.declaration;
          if (declaration) {
            // An overload signature: the implementation is checked.
            if (declaration.type === "TSDeclareFunction") continue;
            if (TYPE_DECLARATIONS.has(declaration.type)) continue;
            const valid =
              declaration.type === "VariableDeclaration"
                ? (declaration.declarations ?? []).every(
                    (declarator) =>
                      declarator.id?.type === "Identifier" && isAsyncFunction(declarator.init),
                  )
                : isAsyncFunction(declaration);
            if (!valid) context.report({ node, message });
            continue;
          }
          // A re-export (`export { f } from "./f.ts"`) names another module's.
          if (node.source) continue;
          for (const specifier of node.specifiers ?? []) {
            if (specifier.exportKind === "type") continue;
            const binding = names.get(specifier.local?.name ?? "");
            if (binding === "other" || binding === undefined) {
              context.report({ node: specifier, message });
            }
          }
        }
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
