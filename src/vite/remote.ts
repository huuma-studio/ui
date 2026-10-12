import type { ESTree } from "vite";

/** What `remoteExports()` found in a remote module. */
export interface RemoteExports {
  /** The value exports, each a remote function; `"default"` for the default export. */
  names: string[];
  /** Exports the browser stub can't name, with the offset of their node. */
  problems: { message: string; start: number }[];
}

// Declarations without a runtime value: they never reach the browser.
const TYPE_DECLARATIONS = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSModuleDeclaration",
]);

/**
 * Finds the exports of a remote module (`*.remote.ts`) from its Oxc AST.
 * Every value export is a remote function. Type-only exports are skipped,
 * including `export { T }` of a local type or of a type-only import.
 *
 * The browser stub needs each export's name, so a few forms are problems:
 * `export *` (the names are in another module), destructuring
 * (`export const { a } = …`), and classes and enums, which can't be called
 * remotely.
 */
export function remoteExports(program: ESTree.Program): RemoteExports {
  const names = new Set<string>();
  const problems: RemoteExports["problems"] = [];
  const types = typeNames(program);

  for (const node of program.body) {
    if (node.type === "ExportDefaultDeclaration") {
      if (node.declaration.type !== "TSInterfaceDeclaration") names.add("default");
    } else if (node.type === "ExportAllDeclaration") {
      if (node.exportKind === "type") continue;
      problems.push({
        message:
          `A remote module can't re-export everything from "${node.source.value}": ` +
          `name the remote functions, e.g. \`export { f } from "${node.source.value}"\`.`,
        start: node.start,
      });
    } else if (node.type === "ExportNamedDeclaration") {
      if (node.exportKind === "type") continue;
      const declaration = node.declaration;
      if (declaration) {
        if (TYPE_DECLARATIONS.has(declaration.type)) continue;
        if (
          declaration.type === "FunctionDeclaration" ||
          declaration.type === "TSDeclareFunction"
        ) {
          // An overload signature (`TSDeclareFunction`) names the same function.
          if (declaration.id) names.add(declaration.id.name);
        } else if (declaration.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations) {
            if (declarator.id.type === "Identifier") {
              names.add(declarator.id.name);
            } else {
              problems.push({
                message:
                  "A remote module can't export a destructured binding: " +
                  "export each remote function by name.",
                start: declarator.start,
              });
            }
          }
        } else {
          problems.push({
            message:
              "A remote module can only export functions: " +
              `${kind(declaration.type)} can't be called from the browser.`,
            start: declaration.start,
          });
        }
        continue;
      }
      for (const specifier of node.specifiers) {
        if (specifier.exportKind === "type") continue;
        // `export { T }` of a local type; a re-export (`from`) names another module's.
        if (!node.source && types.has(moduleExportName(specifier.local))) continue;
        names.add(moduleExportName(specifier.exported));
      }
    }
  }
  return { names: [...names], problems };
}

/** The top-level names that are only types: interfaces, type aliases, type imports. */
function typeNames(program: ESTree.Program): Set<string> {
  const types = new Set<string>();
  for (const node of program.body) {
    if (node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration") {
      types.add(node.id.name);
    } else if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers) {
        if (
          node.importKind === "type" ||
          (specifier.type === "ImportSpecifier" && specifier.importKind === "type")
        ) {
          types.add(specifier.local.name);
        }
      }
    }
  }
  return types;
}

function moduleExportName(name: ESTree.ModuleExportName): string {
  return name.type === "Literal" ? name.value : name.name;
}

function kind(type: string): string {
  if (type === "ClassDeclaration") return "a class";
  if (type === "TSEnumDeclaration") return "an enum";
  return `a ${type}`;
}
