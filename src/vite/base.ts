/**
 * The path the app lives below: the path part of Vite's `base`. Vite's
 * dev server strips it before the app sees a request, and so does
 * `server.js`. The build keeps Vite's `base` as it is for the browser's
 * files, though: a URL like `https://cdn.example/shop/`, whose path is
 * `/shop/`, or the relative `./`, which the browser resolves against each
 * page's URL instead of one path, so the app lives at `/`.
 */
export function appBase(base: string): string {
  if (base === "" || base === "./") return "/";
  if (base.startsWith("/") && !base.startsWith("//")) return base;
  return new URL(base, "http://localhost").pathname;
}

/**
 * The directory below `dist/client` that the client build writes to: the
 * app's base as a relative path, so that a file's path on disk is the
 * path of its URL. `/shop/` is `shop`, and `/` is `""`.
 */
export function baseDirectory(base: string): string {
  // Through URL, like Vite's base, which resolves `.` and `..`.
  const path = new URL(appBase(base), "http://localhost").pathname;
  return decodeURI(path).split("/").filter(Boolean).join("/");
}

/**
 * The request as the app sees it, without `base`, as in Vite's dev
 * server, for `server.js` and adapters' entries, e.g. the Cloudflare
 * Worker: `/shop/about` becomes `/about`. Outside of `base`, `/` redirects
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
