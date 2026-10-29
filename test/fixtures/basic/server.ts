import { createUIApp } from "@huuma/ui/server";

import Root from "./app/root.tsx";

const app = createUIApp(Root);

// App-wide, so remote functions get it too: the user named by the
// `x-user` header, for the request context tests.
app.use(async (ctx, next) => {
  const user = ctx.request.headers.get("x-user");
  if (user) ctx.auth = { user };
  return await next();
});

export default app;
