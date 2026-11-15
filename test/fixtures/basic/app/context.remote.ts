import { requestContext } from "@huuma/ui/server";

import { kv, user } from "./context.server.ts";

export async function whoAmI(): Promise<string | null> {
  return user() ?? null;
}

/** Stores `value` after the response, through `waitUntil()`. */
export async function remember(key: string, value: string): Promise<void> {
  const store = kv();
  if (!store) throw new Error("No KV binding");
  requestContext().waitUntil(store.put(key, value));
}

export async function recall(key: string): Promise<string | null> {
  return (await kv()?.get(key)) ?? null;
}
