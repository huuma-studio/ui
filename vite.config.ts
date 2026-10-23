import { defineConfig } from "vite-plus";
import jsr from "./deno.json" with { type: "json" };

export default defineConfig({
  oxc: {
    // Dev and test builds use @huuma/ui/jsx-dev-runtime.
    jsx: { runtime: "automatic", importSource: "@huuma/ui" },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/*.test.ts", "packages/*/src/**/*.test.ts"],
    // The plugin tests run the Vite they import. That's Vite+'s copy
    // (pnpm's override installs it as `vite`), or with `HUUMA_VITE=upstream`
    // upstream Vite (`vite-upstream`, npm:vite@^8), like an app without Vite+.
    alias:
      process.env.HUUMA_VITE === "upstream"
        ? [{ find: /^vite$/, replacement: "vite-upstream" }]
        : [],
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    // Deno-only smoke tests, checked by `deno test`.
    ignorePatterns: ["test/deno/**"],
    jsPlugins: ["./src/lint/mod.ts"],
    rules: {
      "huuma/async-remote-functions": "error",
      "huuma/no-async-hook-calling": "error",
      "huuma/no-async-client-jsx": "error",
      "huuma/no-request-context-in-islands": "error",
    },
  },
  fmt: {
    // Prose: formatting it would bury content changes in blame.
    ignorePatterns: ["**/*.md"],
  },
  // A native npm build (spec #126, D7), checked in CI but not published. It
  // mirrors src/ so each deno.json export maps to one file in dist/.
  pack: {
    entry: Object.values(jsr.exports),
    root: "src",
    unbundle: true,
    platform: "neutral",
    // Server code imports Node built-ins, which "neutral" doesn't know. The
    // plugin's types come from the app's own Vite (a dev dependency here,
    // which tsdown would otherwise bundle).
    deps: { neverBundle: [/^node:/, "vite"] },
    dts: true,
    failOnWarn: true,
  },
  run: {
    tasks: {
      // Runs every check JSR publish runs, including slow types, for each
      // package: @huuma/ui, then @huuma/ui-cloudflare.
      "jsr:dry-run": {
        command: [
          "jsr publish --dry-run",
          "jsr publish --dry-run --config packages/ui-cloudflare/deno.json",
        ],
        cache: false,
      },
      pack: { command: ["vp pack", "node scripts/check-pack.ts"], cache: false },
    },
  },
});
