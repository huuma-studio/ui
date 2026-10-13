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
