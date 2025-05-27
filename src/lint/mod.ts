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
                  "Huuma server actions MUST be an async function export",
              });
            }
          },
        };
      },
    },
    "no-async-hook-calling": {
      create(context) {
        return {
          "FunctionDeclaration[async=true] CallExpression > Identifier, ArrowFunctionExpression[async=true] CallExpression > Identifier, FunctionExpression[async=true] CallExpression > Identifier"(
            node: Deno.lint.Identifier,
          ) {
            if (node.name.startsWith("$")) {
              context.report({
                node,
                message:
                  "Huuma component hooks not allowed in async components",
              });
            }
          },
        };
      },
    },
    "no-async-client-jsx": {
      create(context) {
        const message = "client-side does not support async jsx";
        const asyncFunctions = new Set<string>();
        return {
          "VariableDeclarator": (node) => {
            if (context.filename.endsWith("client.tsx")) {
              if (
                node.init?.type === "ArrowFunctionExpression" &&
                node.init?.async &&
                node.id.type === "Identifier"
              ) {
                asyncFunctions.add(node.id.name);
              }
            }
          },
          "ExportDefaultDeclaration": (node) => {
            if (context.filename.endsWith("client.tsx")) {
              if (
                node.declaration.type === "ArrowFunctionExpression" &&
                node.declaration.async
              ) {
                context.report({ node, message });
              }
              if (
                node.declaration.type === "FunctionDeclaration" &&
                node.declaration.async
              ) {
                context.report({ node, message });
              }
              if (
                node.declaration.type === "Identifier" &&
                asyncFunctions.has(node.declaration.name)
              ) {
                context.report({ node, message });
              }
            }
          },
        };
      },
    },
  },
} as Deno.lint.Plugin;
