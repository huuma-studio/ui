/*
 * Adds Vite's client to the app's HTML in dev. Web APIs only (Request,
 * Response, Headers), so it runs wherever the app's server code runs, not
 * just in the Node process of Vite's dev server.
 */

/**
 * Adds Vite's client (HMR) to an HTML response. With a Content-Security-
 * Policy nonce, the script gets the same nonce as the page's own scripts,
 * and the policy allows the client's worker (see `allowViteWorker()`).
 * A response without a body (`204`, `304`) stays as it is: those statuses
 * can't have one.
 */
export async function withViteClient(response: Response, base: string): Promise<Response> {
  if (!response.body) return response;
  const policy = response.headers.get("content-security-policy");
  const nonce = /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  if (policy) headers.set("content-security-policy", allowViteWorker(policy));
  return new Response(injectViteClient(await response.text(), base, nonce), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Allows workers from `blob:` URLs in a Content-Security-Policy. Vite's
 * client starts one to poll for a restarted dev server and then reloads the
 * page; the app's default policy (`script-src 'none'`, no `worker-src`)
 * blocks it, so the page stayed stale. Adds `blob:` to `worker-src`, or
 * without one, to a copy of the directive browsers fall back to (`child-src`,
 * `script-src`, then `default-src`), so the app's own workers keep what they
 * were allowed. Without any of them, workers aren't restricted.
 */
export function allowViteWorker(policy: string): string {
  const directives = policy
    .split(";")
    .map((directive) => directive.trim().split(/\s+/))
    .filter(([name]) => name);
  const find = (name: string) => directives.find(([directive]) => directive === name);

  const worker = find("worker-src");
  if (worker) {
    if (!worker.includes("blob:")) worker.push("blob:");
  } else {
    const fallback = find("child-src") ?? find("script-src") ?? find("default-src");
    if (!fallback) return policy;
    directives.push([
      "worker-src",
      ...fallback.slice(1).filter((source) => source !== "'none'"),
      "blob:",
    ]);
  }
  return directives.map((directive) => directive.join(" ")).join("; ");
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
