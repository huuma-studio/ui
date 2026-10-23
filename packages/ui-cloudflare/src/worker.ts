import type { Plugin } from "vite";
import { appBase, SERVER_ID, SERVER_READY } from "@huuma/ui/vite/adapter";

/**
 * The app as a Cloudflare Worker: the `main` the adapter gives
 * @cloudflare/vite-plugin, which wraps it in `dist/server/index.js`. Server
 * only, in dev too, where the plugin runs it in workerd.
 */
export const WORKER_ID = "virtual:huuma/worker";
const RESOLVED_WORKER_ID = `\0${WORKER_ID}`;

/** Serves `virtual:huuma/worker`. */
export function workerPlugin(): Plugin {
  return {
    name: "huuma:worker",
    resolveId: {
      filter: { id: new RegExp(`^${WORKER_ID}$`) },
      handler() {
        return RESOLVED_WORKER_ID;
      },
    },
    load: {
      filter: { id: new RegExp(`^\0${WORKER_ID}$`) },
      handler() {
        if (this.environment.config.consumer !== "server") {
          this.error(`${WORKER_ID} is the app as a Worker and is server only.`);
        }
        const config = this.environment.getTopLevelConfig();
        const dev = this.environment.mode === "dev";
        return {
          code: workerModule(appBase(config.base), dev ? config.base : undefined),
          moduleType: "js",
        };
      },
    },
  };
}

/**
 * Generates the source of `virtual:huuma/worker`. In dev, `viteBase` is
 * Vite's `base`: the app's HTML gets Vite's client, and the module tells
 * the dev server once it's evaluated (`SERVER_READY`).
 */
export function workerModule(base: string, viteBase?: string): string {
  if (viteBase === undefined) {
    return [
      `import app from ${JSON.stringify(SERVER_ID)};`,
      'import { worker } from "@huuma/ui-cloudflare/runtime";',
      "",
      `export default worker(app, ${JSON.stringify(base)});`,
      "",
    ].join("\n");
  }
  return [
    `import app from ${JSON.stringify(SERVER_ID)};`,
    'import { withDevClient } from "@huuma/ui/vite/runtime";',
    'import { worker } from "@huuma/ui-cloudflare/runtime";',
    "",
    `export default worker(withDevClient(app, ${JSON.stringify(viteBase)}), ${JSON.stringify(base)});`,
    "",
    `import.meta.hot?.send(${JSON.stringify(SERVER_READY)});`,
    "",
  ].join("\n");
}
