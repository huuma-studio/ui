/*
 * The dev server. All use of Vite's Environment API, which is still a
 * release candidate, stays in this module (spec #126).
 */
import type { Connect, DevEnvironment, Plugin, RunnableDevEnvironment, ViteDevServer } from "vite";
import { toRequest, writeResponse } from "@huuma/route/node";

import { SERVER_ID } from "./entry.ts";
import { ISLANDS_ID } from "./islands.ts";
import { REMOTE_ID } from "./remote.ts";
import { ROUTES_ID } from "./routes.ts";
import { withViteClient } from "./vite-client.ts";

// The files discovery finds: adding or deleting one changes the routes,
// islands or remote modules, which the generated modules list.
const DISCOVERED = /(\/page\.tsx|\/layout\.tsx|\/middleware\.ts|\.client\.tsx|\.remote\.ts)$/;
const ISLAND = /\.client\.tsx$/;
const GENERATED = [ROUTES_ID, ISLANDS_ID, REMOTE_ID, SERVER_ID].map((id) => `\0${id}`);

/** What `virtual:huuma/server` exports: the app, with route's fetch handler. */
interface App {
  fetch(
    request: Request,
    connection: { remoteAddr: { transport: string; hostname?: string; port?: number } },
  ): Promise<Response>;
}

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
      // An island the browser loaded updates itself (see `islandsPlugin`);
      // everything else reloads the page.
      const island =
        type === "update" &&
        ISLAND.test(file) &&
        !!server.environments.client.moduleGraph.getModulesByFile(file)?.size;
      if (!island) server.environments.client.hot.send({ type: "full-reload" });
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

    let request: Request;
    try {
      request = toRequest(req, controller.signal);
    } catch {
      // A request a web Request can't represent, e.g. the method `TRACE`.
      res.writeHead(400);
      res.end();
      return;
    }

    try {
      const handler = await loadApp(server, app);
      let response = await handler.fetch(request, {
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
async function loadApp(server: ViteDevServer, app: { stale: boolean }): Promise<App> {
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
  const entry = (await ssr.runner.import(SERVER_ID)) as { default: App };
  return entry.default;
}

// `isRunnableDevEnvironment()` from `vite` would be a runtime import.
function isRunnable(environment: DevEnvironment): environment is RunnableDevEnvironment {
  return "runner" in environment;
}
