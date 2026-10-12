/*
 * Converts between Node's HTTP objects, which Vite's dev server uses, and
 * the web Request and Response that a Huuma app handles. Follows the Node
 * adapter of @huuma/route (`serve()`, not yet published); this module can
 * import it once it is.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

// A Host header that can't change the URL's path, such as `localhost:5173`.
const VALID_HOST = /^[^\s/?#@\\]+$/;

/** The web Request for a Node request. Aborts `signal` when the client goes away. */
export function toRequest(req: IncomingMessage, signal: AbortSignal): Request {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i];
    // HTTP/2 pseudo-headers (`:path`) aren't valid header names.
    if (!name.startsWith(":")) headers.append(name, req.rawHeaders[i + 1]);
  }

  const host = VALID_HOST.test(req.headers.host ?? "") ? req.headers.host : "localhost";
  const method = req.method ?? "GET";
  const hasBody = !BODYLESS_METHODS.has(method);

  // Concatenated, not resolved against a base URL: a target such as
  // `//foo/bar` stays a path instead of becoming the host `foo`.
  const target = req.url ?? "/";
  const url = target.startsWith("/") ? `http://${host}${target}` : `http://${host}/${target}`;

  return new Request(url, {
    method,
    headers,
    signal,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>) : null,
    // Required by Node's fetch for streaming request bodies.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

/** Writes a web Response to a Node response, streaming its body. */
export async function writeResponse(response: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") headers[name] = value;
  });
  // Each cookie needs its own header; Headers would join them with ", ".
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, response.statusText, headers);

  if (!response.body) {
    res.end();
    return;
  }
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      res,
    );
  } catch {
    // The client went away or the body failed; the pipeline already
    // destroyed both streams, which cancels the response body.
  }
}
