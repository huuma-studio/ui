export async function generateHash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
  ).map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  ).slice(0, 8);
}

/**
 * Normalize a path (absolute or relative) to a canonical, cross-platform
 * route segment: forward slashes only, with a single leading slash.
 * Used as a stable hash input so client- and server-generated hashes
 * agree on Windows and POSIX alike.
 */
export function toCanonicalPath(path: string): string {
  return "/" + path.replaceAll("\\", "/").replace(/^\/+/, "");
}

/**
 * Checks for a filesystem error by its errno code (e.g. "ENOENT"). Works for
 * errors from `node:fs` as well as Deno's own `Deno.errors.*`, which carry
 * the same `code`.
 */
export function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
