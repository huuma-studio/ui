/*
 * Runs in the Worker, not in the Vite config: `virtual:huuma/worker`, the
 * entry the adapter generates, imports it. Not meant for app code; its API
 * can change with the adapter.
 */
import { belowBase, type FetchHandler } from "@huuma/ui/vite/runtime";

/**
 * The app as a Cloudflare Worker. Workers' static assets serve the client
 * build before the Worker runs, below the base too: the build puts the
 * files in `dist/client` at their URLs' paths. Below a base other than
 * `/`, e.g. `/shop/`, the Worker strips the base for the app, like
 * `server.js`.
 */
export function worker(app: FetchHandler, base: string): FetchHandler {
  if (base === "/") return app;
  return {
    fetch(request, env, ctx) {
      const below = belowBase(request, base);
      return below instanceof Response ? Promise.resolve(below) : app.fetch(below, env, ctx);
    },
  };
}
