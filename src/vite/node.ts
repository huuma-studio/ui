/*
 * Starts a built Huuma app on Node: `dist/server/server.js`, which the
 * production build generates, calls `start()`. It runs in the app's
 * server, not in the Vite config. Kept apart from `@huuma/ui/vite/runtime`
 * because it uses `node:fs`, which `app.js` must not need.
 */
import { type FetchHandler, type NodeServer, serve } from "@huuma/route/node";
import { mimeTypeByExtension } from "@huuma/route/utils/mime-types";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

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
    },
  );
}

/**
 * The request as the app sees it, without `base`, as in Vite's dev
 * server: `/shop/about` becomes `/about`. Outside of `base`, `/` redirects
 * to it, and everything else is not found.
 */
export function belowBase(request: Request, base: string): Request | Response {
  if (base === "/") return request;
  const url = new URL(request.url);
  if (url.pathname.startsWith(base)) {
    url.pathname = url.pathname.slice(base.length - 1);
    // With the request's method, headers, body and signal.
    return new Request(url, request);
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(null, { status: 302, headers: { Location: base + url.search } });
  }
  return new Response(`The server's public base URL is ${base}.`, {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
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
 * starting with `.` (like Vite's `.vite/manifest.json`) aren't served.
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
