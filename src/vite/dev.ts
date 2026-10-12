/*
 * The dev server. All use of Vite's Environment API, which is still a
 * release candidate, stays in this module (spec #126).
 */
import type { Connect, DevEnvironment, Plugin, RunnableDevEnvironment, ViteDevServer } from "vite";

import { SERVER_ID } from "./entry.ts";
import { toRequest, writeResponse } from "./node-http.ts";

/** What `virtual:huuma/server` exports: `UIApp.deliver()`. */
type Handle = (
  request: Request,
  connection: { remoteAddr: { transport: string; hostname?: string; port?: number } },
) => Promise<Response>;

/** Serves the app from Vite's dev server. */
export function devPlugin(): Plugin {
  return {
    name: "huuma:dev",
    apply: "serve",
    configureServer(server) {
      // Returned: runs after Vite's own middlewares, so Vite serves
      // modules and assets first and the app gets every other request.
      return () => {
        server.middlewares.use(appMiddleware(server));
      };
    },
  };
}

function appMiddleware(server: ViteDevServer): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const controller = new AbortController();
    res.once("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      const handle = await loadApp(server);
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
      next(error);
    }
  };
}

/** Imports the app's server entry through the ssr environment's ModuleRunner. */
async function loadApp(server: ViteDevServer): Promise<Handle> {
  const ssr = server.environments.ssr;
  if (!isRunnable(ssr)) {
    throw new Error(
      "Huuma runs the app in Vite's ssr environment, which must be runnable in this " +
        "process (a RunnableDevEnvironment, Vite's default).",
    );
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
 */
async function withViteClient(response: Response, base: string): Promise<Response> {
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
