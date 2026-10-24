/*
 * The contract between `huuma()` and an adapter, which targets one
 * platform: `node()` (`node-adapter.ts`), the default, or e.g.
 * `cloudflare()` from `@huuma/ui-cloudflare`. The core builds the app
 * (`app.js`, a fetch handler); the adapter adds what its platform runs
 * around it, e.g. `server.js` on Node. `@huuma/ui/vite/adapter` exports
 * it for adapters, with what their entries and plugins need of the core.
 *
 * Experimental: only Huuma's own adapters use it so far, and it can
 * change in any release before 0.3.0, also the hooks and what they get.
 */
import type { PluginOption, ViteBuilder } from "vite";

export { appBase, baseDirectory } from "./base.ts";
export { SERVER_ID } from "./entry.ts";

/**
 * What a platform's entry sends Vite in dev once it's evaluated, e.g.
 * again after a server change: the dev server reloads the browser then,
 * so its request doesn't reach the app while it's evaluated. An adapter
 * with `dev: "platform"` must send it, with `import.meta.hot?.send()`:
 * without it, the browser doesn't reload after a server change.
 *
 * @experimental Can change before 0.3.0, with `HuumaAdapter`.
 */
export const SERVER_READY = "huuma:server-ready";

/**
 * One platform the app runs on: `huuma({ adapter })`.
 *
 * @experimental Can change before 0.3.0; see the module's notes.
 */
export interface HuumaAdapter {
  /** The adapter's name, e.g. `"node"`, for messages. */
  name: string;
  /**
   * Who runs the app's server code in dev: Huuma, in Vite's process with
   * the ssr environment's module runner (`"runner"`, the default), or the
   * adapter's plugins in the platform's runtime (`"platform"`), e.g.
   * @cloudflare/vite-plugin in workerd. With `"platform"`, those plugins
   * serve the requests, and the platform's entry sends `SERVER_READY`
   * each time it's evaluated.
   */
  dev?: "runner" | "platform";
  /**
   * The adapter's Vite plugins. `huuma()` puts them after its own, so
   * their `config` hooks see Huuma's config, e.g. its `builder.buildApp`
   * and the environments' `outDir`.
   */
  plugins?: PluginOption[];
  /**
   * In `vite build`, before the client build, when Vite writes the
   * client build to disk.
   */
  beforeBuild?(builder: ViteBuilder): Promise<void>;
  /**
   * In `vite build`, after the server build and the move of the files
   * the server imports to the client build, when Vite writes the client
   * build to disk.
   */
  afterBuild?(builder: ViteBuilder, build: AppBuild): Promise<void>;
}

/**
 * What `afterBuild` gets to know about the build.
 *
 * @experimental Can change before 0.3.0, with `HuumaAdapter`.
 */
export interface AppBuild {
  /**
   * The files in the client build's `outDir` with a content hash in
   * their name, which never change: the client build's own, and those
   * moved from the server build, relative to `outDir`, e.g.
   * `assets/counter.client-3f2a1b4c.js`.
   */
  hashed: ReadonlySet<string>;
}
