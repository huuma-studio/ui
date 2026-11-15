/*
 * Starts a built Huuma app on Node: `dist/server/server.js`, which the
 * production build generates, calls `start()` and `stopOnSignals()`. It runs in the app's
 * server, not in the Vite config. Kept apart from `@huuma/ui/vite/runtime`
 * because it uses `node:fs`, which `app.js` must not need.
 */
import { type FetchHandler, type NodeServer, serve } from "@huuma/route/node";
import { info, warn } from "@huuma/route/utils/logger";
import { mimeTypeByExtension } from "@huuma/route/utils/mime-types";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { belowBase } from "./base.ts";

// Part of this module's API before `belowBase()` moved to `base.ts`.
export { belowBase };

export interface StartOptions {
  /** The client build's output directory (`dist/client`). */
  client: string | URL;
  /** Vite's `base`, which every browser path starts with. Defaults to `"/"`. */
  base?: string;
  /**
   * The client build's files with a content hash in their name, e.g.
   * `assets/counter.client-3f2a.js`: cached for good. Other files, like
   * copies of Vite's public dir, are cached for an hour.
   */
  hashed?: Iterable<string>;
  /** Defaults to the `PORT` environment variable, else `8000`. */
  port?: number;
  /** Defaults to the `HOST` environment variable, else all interfaces. */
  hostname?: string;
  /** Stops the server when aborted. */
  signal?: AbortSignal;
  /**
   * How long the running requests may take to finish once the server
   * stops, in milliseconds. Then their connections are closed. Defaults to
   * 10 seconds.
   */
  shutdownTimeout?: number;
}

/**
 * Serves `app` on Node with `serve()` from `@huuma/route/node`, and the
 * client build's files before it. Like Vite's dev server, the app lives
 * below `base` and sees paths without it. Resolves once the server is
 * listening.
 */
export function start(app: FetchHandler, options: StartOptions): Promise<NodeServer> {
  const files = clientFiles(options);
  const base = options.base ?? "/";
  return serve(
    {
      async fetch(request, info) {
        const file = await files(request);
        if (file) return file;
        const below = belowBase(request, base);
        return below instanceof Response ? below : app.fetch(below, info);
      },
    },
    {
      port: options.port ?? port(process.env.PORT),
      hostname: options.hostname ?? (process.env.HOST || undefined),
      signal: options.signal,
      shutdownTimeout: options.shutdownTimeout ?? 10_000,
    },
  );
}

/**
 * Stops `server` gracefully on `SIGTERM` (a deploy or a restart) and
 * `SIGINT` (Ctrl+C): it accepts no new connections, lets the running
 * requests finish, then exits with code 0. If they take longer than
 * `start()`'s `shutdownTimeout`, their connections are closed and it exits
 * with code 1; on a second signal it exits with code 1 right away, cutting
 * off what still runs. `server.js` calls it.
 */
export function stopOnSignals(server: NodeServer): void {
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) {
      warn("NODE", `${signal} again: stopping without waiting for the running requests.`);
      process.exit(1);
    }
    stopping = true;
    info("NODE", `${signal}: finishing the running requests, then stopping.`);
    void server.shutdown().then(({ forced }) => {
      if (forced) {
        warn("NODE", "The running requests didn't finish in time: closed their connections.");
      }
      process.exit(forced ? 1 : 0);
    });
  };
  for (const signal of ["SIGTERM", "SIGINT"]) {
    try {
      process.on(signal, stop);
    } catch {
      // A signal the platform can't listen to, e.g. SIGTERM in Deno on Windows.
    }
  }
}

function port(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(`PORT must be a port number, not "${value}".`);
  }
  return port;
}

/**
 * Responds with a file of the client build for a `GET` or `HEAD` request
 * below `base`, or `undefined` if there is none. Files and directories
 * starting with `.` (like Vite's `.vite/manifest.json`) aren't served, and
 * neither is `_headers`, other platforms' header rules for them, e.g.
 * Cloudflare Workers', from Vite's public dir.
 * Files with hashed names (`hashed`) are cached for good, others for an
 * hour.
 */
export function clientFiles(
  options: Pick<StartOptions, "client" | "base" | "hashed">,
): (request: Request) => Promise<Response | undefined> {
  const directory = resolve(
    typeof options.client === "string" ? options.client : fileURLToPath(options.client),
  );
  const base = options.base ?? "/";
  const hashed = new Set(options.hashed);

  return async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") return;
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(base)) return;

    let path: string;
    try {
      path = decodeURIComponent(pathname.slice(base.length));
    } catch {
      return;
    }
    const segments = path.split("/");
    if (
      !path ||
      segments.some((segment) => !segment || segment.startsWith(".")) ||
      /[\\\0]/.test(path)
    ) {
      return;
    }
    // E.g. from Vite's public dir, for another platform.
    if (path === "_headers") return;
    const file = resolve(directory, path);
    if (!file.startsWith(directory + sep)) return;

    let size: number;
    try {
      const stats = await stat(file);
      if (!stats.isFile()) return;
      size = stats.size;
    } catch {
      return;
    }

    const headers = new Headers({
      "Content-Type":
        mimeTypeByExtension(extname(file).slice(1))?.type ?? "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": hashed.has(path)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    });
    if (request.method === "HEAD") return new Response(null, { headers });
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, {
      headers,
    });
  };
}
