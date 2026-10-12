/*
 * The dev server. All use of Vite's Environment API, which is still a
 * release candidate, stays in this module (spec #126).
 */
import type { Connect, DevEnvironment, Plugin, RunnableDevEnvironment, ViteDevServer } from "vite";

import { SERVER_ID } from "./entry.ts";
import { ISLANDS_ID } from "./islands.ts";
import { toRequest, writeResponse } from "./node-http.ts";
import { ROUTES_ID } from "./routes.ts";

// The files discovery finds: adding or deleting one changes the routes or
// islands, which the generated modules list.
const DISCOVERED = /(\/page\.tsx|\/layout\.tsx|\/middleware\.ts|\.client\.tsx)$/;
const GENERATED = [ROUTES_ID, ISLANDS_ID, SERVER_ID].map((id) => `\0${id}`);

/** What `virtual:huuma/server` exports: `UIApp.deliver()`. */
type Handle = (
  request: Request,
  connection: { remoteAddr: { transport: string; hostname?: string; port?: number } },
) => Promise<Response>;

/**
 * Serves the app from Vite's dev server, and rebuilds it when its server
 * code changes. `serverEntry()` is the absolute path of the app's module.
 */
export function devPlugin(serverEntry: () => string): Plugin {
  // Whether the app must be rebuilt before the next request.
  const app = { stale: false };
  return {
    name: "huuma:dev",
    apply: "serve",
    configureServer(server) {
      // Returned: runs after Vite's own middlewares, so Vite serves
      // modules and assets first and the app gets every other request.
      return () => {
        server.middlewares.use(appMiddleware(server, app));
      };
    },
    hotUpdate({ type, file, modules, server }) {
      if (this.environment.name !== "ssr") return;
      const discovered = type !== "update" && (DISCOVERED.test(file) || file === serverEntry());
      // Not part of the app's server, e.g. client-only CSS.
      if (!discovered && !modules.length) return;

      if (discovered) {
        const graph = this.environment.moduleGraph;
        for (const id of GENERATED) {
          const module = graph.getModuleById(id);
          if (module) graph.invalidateModule(module);
        }
      }
      app.stale = true;
      server.environments.client.hot.send({ type: "full-reload" });
      // Handled: the ModuleRunner gets no HMR update of its own.
      return [];
    },
  };
}

function appMiddleware(server: ViteDevServer, app: { stale: boolean }): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const controller = new AbortController();
    res.once("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      const handle = await loadApp(server, app);
      let response = await handle(toRequest(req, controller.signal), {
        remoteAddr: {
          transport: "tcp",
          hostname: req.socket.remoteAddress,
          port: req.socket.remotePort,
        },
      });
      if (response.headers.get("content-type")?.startsWith("text/html")) {
        response = await withViteClient(response, server.config.base);
      }
      await writeResponse(response, res);
    } catch (error) {
      // Maps the stack trace to the app's source before Vite shows it.
      if (error instanceof Error) server.ssrFixStacktrace(error);
      if (res.headersSent) {
        // The response already started (its body failed while streaming),
        // so Vite's error page can't be sent: log it instead.
        server.config.logger.error(
          `[huuma] ${req.url}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
          { error: error instanceof Error ? error : null },
        );
        res.destroy();
        return;
      }
      next(error);
    }
  };
}

/**
 * Imports the app's server entry through the ssr environment's
 * ModuleRunner. After a change, it first clears the runner's cache, so the
 * whole app is evaluated again: re-evaluating only the changed modules
 * would mount the pages onto the old app instance, whose router rejects
 * routes it already has.
 */
async function loadApp(server: ViteDevServer, app: { stale: boolean }): Promise<Handle> {
  const ssr = server.environments.ssr;
  if (!isRunnable(ssr)) {
    throw new Error(
      "Huuma runs the app in Vite's ssr environment, which must be runnable in this " +
        "process (a RunnableDevEnvironment, Vite's default).",
    );
  }
  if (app.stale) {
    app.stale = false;
    ssr.runner.clearCache();
  }
  const entry = (await ssr.runner.import(SERVER_ID)) as { default: Handle };
  return entry.default;
}

// `isRunnableDevEnvironment()` from `vite` would be a runtime import.
function isRunnable(environment: DevEnvironment): environment is RunnableDevEnvironment {
  return "runner" in environment;
}

/**
 * Adds Vite's client (HMR) to an HTML response. With a Content-Security-
 * Policy nonce, the script gets the same nonce as the page's own scripts.
 * A response without a body (`204`, `304`) stays as it is: those statuses
 * can't have one.
 */
export async function withViteClient(response: Response, base: string): Promise<Response> {
  if (!response.body) return response;
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1];
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(injectViteClient(await response.text(), base, nonce), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Inserts Vite's client script at the end of `<head>`; without one, after
 * `<html>`, after the doctype or at the very start.
 */
export function injectViteClient(html: string, base: string, nonce?: string): string {
  const script = `<script type="module" src="${base}@vite/client"${
    nonce ? ` nonce="${nonce}"` : ""
  }></script>`;
  const head = /<\/head>/i.exec(html);
  if (head) return html.slice(0, head.index) + script + html.slice(head.index);
  const start = /<html[^>]*>/i.exec(html) ?? /<!doctype html>/i.exec(html);
  if (start) {
    const at = start.index + start[0].length;
    return html.slice(0, at) + script + html.slice(at);
  }
  return script + html;
}
