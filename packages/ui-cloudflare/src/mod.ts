/*
 * The Cloudflare Workers adapter for Huuma UI (spec #143, D9 and D10): the
 * app runs as a Worker, in workerd during `vite` too, through
 * @cloudflare/vite-plugin, which this adapter creates.
 */
import { cloudflare as cloudflarePlugin, type PluginConfig } from "@cloudflare/vite-plugin";
import type { HuumaAdapter } from "@huuma/ui/vite/adapter";

import { WORKER_ID, workerPlugin } from "./worker.ts";
import { cleanClientBuild, wranglerAssetsPlugin, writeClientFiles } from "./workers.ts";

/**
 * Options of @cloudflare/vite-plugin, which the adapter passes on, e.g.
 * `remoteBindings` or `configPath`. The plugin runs Vite's ssr
 * environment, where Huuma builds the app, so `viteEnvironment` is the
 * adapter's.
 */
export interface CloudflareOptions extends Omit<PluginConfig, "viteEnvironment"> {}

/**
 * The adapter for Cloudflare Workers:
 *
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { huuma } from "@huuma/ui/vite";
 * import { cloudflare } from "@huuma/ui-cloudflare";
 *
 * export default defineConfig({ plugins: [huuma({ adapter: cloudflare() })] });
 * ```
 *
 * The Worker is the app (`virtual:huuma/worker`), so `wrangler.jsonc`
 * needs no `main`. `vite` runs it in workerd, with the Worker's bindings,
 * and `vite build` writes it with the `wrangler.json` that `wrangler
 * deploy` deploys.
 */
export function cloudflare(options: CloudflareOptions = {}): HuumaAdapter {
  return {
    name: "cloudflare",
    dev: "platform",
    plugins: [
      cloudflarePlugin({
        ...options,
        viteEnvironment: { name: "ssr" },
        config: withMain(options.config),
      }),
      workerPlugin(),
      wranglerAssetsPlugin(),
    ],
    beforeBuild: cleanClientBuild,
    afterBuild: writeClientFiles,
  };
}

/**
 * The app's Worker config, with Huuma's Worker as `main` unless
 * `wrangler.jsonc` or the `config` option names another, e.g. a Worker of
 * the app's that wraps it.
 */
function withMain(config: CloudflareOptions["config"]): NonNullable<PluginConfig["config"]> {
  return (worker) => {
    const own = typeof config === "function" ? config(worker) : config;
    return { ...(worker.main ? {} : { main: WORKER_ID }), ...own };
  };
}
