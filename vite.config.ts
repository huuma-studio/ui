import { defineConfig } from "vite-plus";

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
  run: {
    tasks: {
      // Runs every check JSR publish runs, including slow types.
      "jsr:dry-run": { command: "jsr publish --dry-run", cache: false },
    },
  },
});
