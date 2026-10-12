import { defineConfig } from "vite-plus";
import jsr from "./jsr.json" with { type: "json" };

export default defineConfig({
  oxc: {
    // Dev and test builds use @huuma/ui/jsx-dev-runtime.
    jsx: { runtime: "automatic", importSource: "@huuma/ui" },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/*.test.ts"],
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
    // Server code imports Node built-ins, which "neutral" doesn't know.
    deps: { neverBundle: [/^node:/] },
    dts: true,
    failOnWarn: true,
  },
  run: {
    tasks: {
      // Runs every check JSR publish runs, including slow types.
      "jsr:dry-run": { command: "jsr publish --dry-run", cache: false },
      pack: { command: ["vp pack", "node scripts/check-pack.ts"], cache: false },
    },
  },
});
