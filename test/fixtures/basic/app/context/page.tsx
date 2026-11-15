import { requestContext } from "@huuma/ui/server";

import { kv, user } from "../context.server.ts";

// Async, so the context has to last across awaits.
export default async function Context() {
  const value = (await kv()?.get("greeting")) ?? "none";
  const { searchParams } = requestContext();
  return (
    <dl>
      <dt>User</dt>
      <dd id="user">{user() ?? "nobody"}</dd>
      <dt>Greeting</dt>
      <dd id="greeting">{value}</dd>
      <dt>Query</dt>
      <dd id="query">{String(searchParams.q ?? "")}</dd>
    </dl>
  );
}
