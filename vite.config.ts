import { defineConfig } from "vite-plus";

export default defineConfig({
  oxc: {
    // Production runtime until @huuma/ui/jsx-dev-runtime exists (Phase 3).
    jsx: { runtime: "automatic", importSource: "@huuma/ui", development: false },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/*.test.ts"],
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    // Deno-only smoke tests, checked by `deno test`.
    ignorePatterns: ["test/deno/**"],
  },
});
