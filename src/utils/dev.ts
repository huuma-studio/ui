/**
 * Whether the app runs in production: `NODE_ENV` is `"production"`. Vite
 * replaces `process.env.NODE_ENV` in browser code; elsewhere it's read from
 * the environment, and a browser without the replacement has no `process`,
 * which counts as development.
 */
export function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === "production";
  } catch {
    return false;
  }
}

const warned = new Set<string>();

/** Warns once per message, outside of production. */
export function devWarn(message: string): void {
  if (isProduction() || warned.has(message)) return;
  warned.add(message);
  console.warn(`[huuma] ${message}`);
}
