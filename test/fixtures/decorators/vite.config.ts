// Runs the fixture app by hand: `pnpm exec vp dev test/fixtures/decorators`.
// The plugin tests don't read this file; they configure Vite in code.
import { defineConfig } from "vite";
import { huuma } from "@huuma/ui/vite";

export default defineConfig({ plugins: [huuma()] });
