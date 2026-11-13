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
  imported?: AstNode;
  source?: AstNode | null;
  value?: unknown;
  callee?: AstNode;
  object?: AstNode;
  property?: AstNode;
  computed?: boolean;
  parent?: AstNode | null;
  params?: AstNode[];
  param?: AstNode | null;
  parameter?: AstNode;
  left?: AstNode;
  argument?: AstNode | null;
  elements?: (AstNode | null)[];
  properties?: AstNode[];
  cases?: AstNode[];
  consequent?: AstNode[] | AstNode | null;
}

// The scope analysis of Oxlint and ESLint. `deno lint` has none.
interface Scope {
  references: {
    identifier: AstNode;
    resolved: { defs: { type: string }[] } | null;
  }[];
}

interface RuleContext {
  filename: string;
  sourceCode?: { getScope?(node: AstNode): Scope };
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

// `@huuma/ui/server`, also with a `jsr:`/`npm:` prefix or a version.
const SERVER_MODULE = /^(?:jsr:|npm:)?@huuma\/ui(?:@[^/]*)?\/server$/;
const REQUEST_CONTEXT_FUNCTIONS = new Set(["requestContext", "hasRequestContext"]);

/** An identifier's name, or a string literal's value (`import { "a" as b }`). */
function nameOf(node: AstNode | null | undefined): string | undefined {
  return node?.type === "Identifier"
    ? node.name
    : typeof node?.value === "string"
      ? node.value
      : undefined;
}

/** Whether a parameter or declarator pattern binds `name`. */
function binds(pattern: AstNode | null | undefined, name: string): boolean {
  switch (pattern?.type) {
    case "Identifier":
      return pattern.name === name;
    case "AssignmentPattern":
      return binds(pattern.left, name);
    case "RestElement":
      return binds(pattern.argument, name);
    case "TSParameterProperty":
      return binds(pattern.parameter, name);
    case "ArrayPattern":
      return (pattern.elements ?? []).some((element) => binds(element, name));
    case "ObjectPattern":
      return (pattern.properties ?? []).some((property) =>
        binds(property.type === "RestElement" ? property : (property.value as AstNode), name),
      );
    default:
      return false;
  }
}

/** Whether one of these statements declares `name` in their block. */
function declaresIn(statements: AstNode[], name: string): boolean {
  return statements.some((statement) =>
    statement.type === "VariableDeclaration"
      ? (statement.declarations ?? []).some((declarator) => binds(declarator.id, name))
      : (statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") &&
        statement.id?.name === name,
  );
}

/** Whether this node opens a scope that declares `name`. */
function declares(scope: AstNode, name: string): boolean {
  switch (scope.type) {
    case "FunctionDeclaration":
    case "ArrowFunctionExpression":
      return (scope.params ?? []).some((param) => binds(param, name));
    case "FunctionExpression":
    case "ClassExpression":
      // A function or class expression's own name is visible only inside it.
      return scope.id?.name === name || (scope.params ?? []).some((param) => binds(param, name));
    case "BlockStatement":
    case "StaticBlock":
      return declaresIn(Array.isArray(scope.body) ? scope.body : [], name);
    case "SwitchStatement":
      // All cases share the switch's block.
      return declaresIn(
        (scope.cases ?? []).flatMap((switchCase) =>
          Array.isArray(switchCase.consequent) ? switchCase.consequent : [],
        ),
        name,
      );
    case "CatchClause":
      return binds(scope.param, name);
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement": {
      const head = scope.init ?? scope.left;
      return !!head && declaresIn([head], name);
    }
    default:
      return false;
  }
}

/**
 * Whether a scope between `node` and the module's top level declares `name`,
 * so that `node` uses that declaration rather than an import. `var`s in
 * nested blocks aren't seen. Every linter gives nodes their `parent`.
 */
function shadowed(node: AstNode, name: string): boolean {
  for (let scope = node.parent; scope && scope.type !== "Program"; scope = scope.parent) {
    if (declares(scope, name)) return true;
  }
  return false;
}

/**
 * Whether `identifier` refers to the module's import of its name, not to a
 * local declaration that shadows it. Resolved through the linter's scope
 * analysis where there is one (Oxlint, ESLint), else by `shadowed()`
 * (`deno lint`).
 */
function usesImport(context: RuleContext, identifier: AstNode): boolean {
  const scope = context.sourceCode?.getScope?.(identifier);
  const reference = scope?.references.find((reference) => reference.identifier === identifier);
  if (!reference) return !shadowed(identifier, identifier.name ?? "");
  return !!reference.resolved?.defs.some((def) => def.type === "ImportBinding");
}

const noRequestContextInIslands: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Islands must not read the request context: they run in the browser too.",
    },
  },
  create(context) {
    const island = context.filename.endsWith(".client.tsx");
    // Local names of the functions, and of `import * as server`.
    const functions = new Map<string, string>();
    const namespaces = new Set<string>();
    const report = (node: AstNode, name: string) =>
      context.report({
        node,
        message:
          `${name}() works on the server only, but islands render in the browser too: ` +
          "read the request in the page and pass the island what it needs as props",
      });
    return {
      ImportDeclaration(node) {
        if (!island || node.importKind === "type") return;
        if (!SERVER_MODULE.test(String(node.source?.value))) return;
        for (const specifier of node.specifiers ?? []) {
          const local = specifier.local?.name;
          if (!local || specifier.importKind === "type") continue;
          if (specifier.type === "ImportNamespaceSpecifier") {
            namespaces.add(local);
          } else if (specifier.type === "ImportSpecifier") {
            const imported = nameOf(specifier.imported);
            if (imported && REQUEST_CONTEXT_FUNCTIONS.has(imported)) functions.set(local, imported);
          }
        }
      },
      CallExpression(node) {
        let callee: AstNode | null | undefined = node.callee;
        while (callee && TRANSPARENT.has(callee.type)) callee = callee.expression;
        if (callee?.type === "Identifier") {
          const name = functions.get(callee.name ?? "");
          if (name && usesImport(context, callee)) report(node, name);
        } else if (
          callee?.type === "MemberExpression" &&
          callee.object?.type === "Identifier" &&
          namespaces.has(callee.object.name ?? "") &&
          usesImport(context, callee.object)
        ) {
          // `server["requestContext"]()`, but not `server[name]()`: only a
          // string literal says which function it calls.
          const property = callee.property;
          const name = !callee.computed
            ? property?.name
            : property?.type === "Literal" && typeof property.value === "string"
              ? property.value
              : undefined;
          if (name && REQUEST_CONTEXT_FUNCTIONS.has(name)) report(node, name);
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
    "no-request-context-in-islands": noRequestContextInIslands,
  },
  configs: {},
};

plugin.configs.recommended = {
  plugins: { huuma: plugin },
  rules: {
    "huuma/async-remote-functions": "error",
    "huuma/no-async-hook-calling": "error",
    "huuma/no-async-client-jsx": "error",
    "huuma/no-request-context-in-islands": "error",
  },
};

export default plugin;
