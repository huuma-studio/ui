/*
 * The contract between `huuma()` and an adapter, which targets one
 * platform: `node()` (`node-adapter.ts`), the default. The core builds the
 * app (`app.js`, a fetch handler); the adapter adds what its platform runs
 * around it, e.g. `server.js` on Node.
 */
import type { PluginOption } from "vite";

/** One platform the app runs on: `huuma({ adapter })`. */
export interface HuumaAdapter {
  /** The adapter's name, e.g. `"node"`, for messages. */
  name: string;
  /**
   * The adapter's Vite plugins. `huuma()` puts them after its own, so
   * their `config` hooks see Huuma's config, e.g. its `builder.buildApp`
   * and the environments' `outDir`.
   */
  plugins?: PluginOption[];
}
