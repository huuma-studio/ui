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
  /** The client build's `build.assetsDir`, whose files have hashed names. Defaults to `"assets"`. */
  assetsDir?: string;
  /** Defaults to the `PORT` environment variable, else `8000`. */
  port?: number;
  /** Defaults to the `HOST` environment variable, else all interfaces. */
  hostname?: string;
  /** Stops the server when aborted. */
  signal?: AbortSignal;
}

/**
 * Serves `app` on Node with `serve()` from `@huuma/route/node`, and the
 * client build's files before it. Resolves once the server is listening.
 */
export function start(app: FetchHandler, options: StartOptions): Promise<NodeServer> {
  const files = clientFiles(options);
  return serve(
    {
      async fetch(request, info) {
        return (await files(request)) ?? app.fetch(request, info);
      },
    },
    {
      port: options.port ?? port(process.env.PORT),
      hostname: options.hostname ?? (process.env.HOST || undefined),
      signal: options.signal,
    },
  );
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
 * Files in `assetsDir` have hashed names and are cached for good.
 */
export function clientFiles(
  options: Pick<StartOptions, "client" | "base" | "assetsDir">,
): (request: Request) => Promise<Response | undefined> {
  const directory = resolve(
    typeof options.client === "string" ? options.client : fileURLToPath(options.client),
  );
  const base = options.base ?? "/";
  const assets = `${(options.assetsDir ?? "assets").replace(/^\/|\/$/g, "")}/`;

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
      "Cache-Control": path.startsWith(assets)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    });
    if (request.method === "HEAD") return new Response(null, { headers });
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, {
      headers,
    });
  };
}
