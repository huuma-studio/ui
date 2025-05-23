export default {
  name: "huuma",
  rules: {
    "async-actions": {
      create(context) {
        return {
          ExportNamedDeclaration(node) {
            if (
              node.declaration?.type === "FunctionDeclaration" &&
              node.declaration.async
            ) {
              return;
            } else if (context.filename.endsWith(".actions.ts")) {
              context.report({
                node,
                message:
                  "Huuma server actions MUST be async an async function export",
              });
            }
          },
        };
      },
    },
    "no-async-hooks": {
      create(context) {
        return {
          "FunctionDeclaration[async=true] CallExpression > Identifier, ArrowFunctionExpression[async=true] CallExpression > Identifier, FunctionExpression[async=true] CallExpression > Identifier"(
            node: Deno.lint.Identifier,
          ) {
            if (node.name.endsWith("actions.tsx")) {
              context.report({
                node,
                message: "Huuma component hooks not allowed in async functions",
              });
            }
          },
        };
      },
    },
  },
} as Deno.lint.Plugin;
