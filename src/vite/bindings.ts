import type { ESTree } from "vite";

/**
 * The names a module binds to a runtime value at its top level: value
 * imports, variables (also destructured ones), functions, classes and
 * enums, exported or not. Types and ambient (`declare`) declarations have
 * no value and are left out.
 */
export function valueBindings(program: ESTree.Program): Set<string> {
  const names = new Set<string>();
  for (const node of program.body) {
    const declaration =
      node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration"
        ? node.declaration
        : node;
    if (!declaration) continue;
    switch (declaration.type) {
      case "ImportDeclaration":
        if (declaration.importKind === "type") break;
        for (const specifier of declaration.specifiers) {
          if (specifier.type === "ImportSpecifier" && specifier.importKind === "type") continue;
          names.add(specifier.local.name);
        }
        break;
      case "VariableDeclaration":
        if (declaration.declare) break;
        for (const declarator of declaration.declarations) patternNames(declarator.id, names);
        break;
      case "FunctionDeclaration":
      case "ClassDeclaration":
      case "TSEnumDeclaration":
        if (!declaration.declare && declaration.id) names.add(declaration.id.name);
        break;
    }
  }
  return names;
}

function patternNames(pattern: ESTree.BindingPattern, names: Set<string>): void {
  switch (pattern.type) {
    case "Identifier":
      names.add(pattern.name);
      break;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        patternNames(property.type === "RestElement" ? property.argument : property.value, names);
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element)
          patternNames(element.type === "RestElement" ? element.argument : element, names);
      }
      break;
    case "AssignmentPattern":
      patternNames(pattern.left, names);
      break;
  }
}
