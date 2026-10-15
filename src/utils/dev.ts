/**
 * Whether the app runs in production: `NODE_ENV` is `"production"`, or
 * `HUUMA_ENV` is `"PROD"` (`@huuma/route`'s production mode, which the
 * README uses to start `server.js`). Vite replaces `process.env.NODE_ENV`
 * in browser code; elsewhere both are read from the environment, and a
 * browser without the replacement has no `process`, which counts as
 * development.
 */
export function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === "production" || process.env.HUUMA_ENV === "PROD";
  } catch {
    return false;
  }
}

// How many distinct warnings are remembered and shown. Messages can carry
// request data (e.g. an attribute name from spread props), so without a
// limit, a client could grow the set and flood the log.
const MAX_WARNINGS = 100;

const warned = new Set<string>();

/**
 * Warns once per message, outside of production, and stops after
 * `MAX_WARNINGS` distinct messages (with a last warning saying so).
 */
export function devWarn(message: string): void {
  if (isProduction() || warned.has(message) || warned.size > MAX_WARNINGS) return;
  if (warned.size === MAX_WARNINGS) {
    warned.add("");
    console.warn(`[huuma] More than ${MAX_WARNINGS} warnings; not showing more.`);
    return;
  }
  warned.add(message);
  console.warn(`[huuma] ${message}`);
}
