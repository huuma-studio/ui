import { defineConfig } from "vite-plus";
import jsr from "./jsr.json" with { type: "json" };

export default defineConfig({
  oxc: {
    // Dev and test builds use @huuma/ui/jsx-dev-runtime.
    jsx: { runtime: "automatic", importSource: "@huuma/ui" },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/*.test.ts"],
    // Many suites build a fixture, start a server or launch a browser, next
    // to all the other test files: on a busy CI runner, that takes longer
    // than Vitest's defaults (5s a test, 10s a hook) allow. The hooks'
    // timeout is above the time a server may take to start (test/build.ts).
    testTimeout: 30_000,
    hookTimeout: 60_000,
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
  // mirrors src/ so each jsr.json export maps to one file in dist/.
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
      // Runs every check JSR publish runs, including slow types. Not
      // Deno's type check: it doesn't find the types of `vite` in
      // node_modules, and `vp check` checks the types already.
      "jsr:dry-run": { command: "deno publish --dry-run --no-check", cache: false },
      pack: { command: ["vp pack", "node scripts/check-pack.ts"], cache: false },
    },
  },
});
