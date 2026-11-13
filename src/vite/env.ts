import type { Plugin } from "vite";
import { relative } from "node:path";

import { valueBindings } from "./bindings.ts";

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
        if (valueBindings(this.parse(code)).has("Deno")) return;
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
