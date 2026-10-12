import type { ESTree, Plugin } from "vite";
import { relative } from "node:path";

const DENO_ENV_GET = /\bDeno\.env\.get\b/;

/**
 * Keeps `Deno.env.get()` working in an app's modules for one more minor
 * version, with a deprecation warning per module. The Deno pipeline
 * shimmed it in browser code with the `PUBLIC_*` variables; under Vite it
 * reads `import.meta.env` (the `PUBLIC_*` variables) in the browser, and
 * also the process environment on the server, which may run on Node.
 *
 * A module that declares its own top-level `Deno` keeps it.
 */
export function denoEnvPlugin(): Plugin {
  return {
    name: "huuma:deno-env",
    transform: {
      // After Oxc: the module is JavaScript.
      filter: {
        id: { include: /\.[cm]?[jt]sx?(\?.*)?$/, exclude: /[\\/]node_modules[\\/]/ },
        code: DENO_ENV_GET,
      },
      handler(code, id) {
        if (declaresDeno(this.parse(code))) return;
        const file = relative(this.environment.config.root, id.replace(/\?.*$/, ""));
        this.warn(
          `${file}: \`Deno.env.get()\` is deprecated and will be removed in the next minor ` +
            "version. Use `import.meta.env.PUBLIC_*` (and `process.env` on the server).",
        );
        const get =
          this.environment.config.consumer === "client"
            ? "(key) => import.meta.env[key]"
            : "(key) => import.meta.env[key] ?? process.env[key]";
        return {
          // On the first line, so the other lines keep their source map.
          code: `const Deno = { env: { get: ${get} } };${code}`,
          map: null,
        };
      },
    },
  };
}

/** Whether a module binds `Deno` at its top level. */
function declaresDeno(program: ESTree.Program): boolean {
  return program.body.some((node) => {
    const declaration = node.type === "ExportNamedDeclaration" ? node.declaration : node;
    if (!declaration) return false;
    switch (declaration.type) {
      case "ImportDeclaration":
        return declaration.specifiers.some((specifier) => specifier.local.name === "Deno");
      case "FunctionDeclaration":
      case "ClassDeclaration":
        return declaration.id?.name === "Deno";
      case "VariableDeclaration":
        return declaration.declarations.some(
          (declarator) => declarator.id.type === "Identifier" && declarator.id.name === "Deno",
        );
      default:
        return false;
    }
  });
}
