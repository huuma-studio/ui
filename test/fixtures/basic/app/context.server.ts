import { requestContext } from "@huuma/ui/server";

/** A KV namespace, as Cloudflare Workers bind it. */
interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/**
 * The fixture's `KV` binding, read through the request context: a Worker
 * has one (the tests' `wrangler.jsonc` declares it), Node and Deno don't.
 */
export function kv(): KV | undefined {
  return (requestContext().env as { KV?: KV }).KV;
}

/** The user the app's middleware found, if any. */
export function user(): string | undefined {
  return (requestContext().auth as { user?: string } | undefined)?.user;
}
