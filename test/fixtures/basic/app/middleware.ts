import type { Middleware } from "@huuma/route/middleware";

// Marks every response, so tests can see that middlewares run.
const mark: Middleware = async (_ctx, next) => {
  const response = await next();
  response.headers.set("x-fixture-middleware", "app");
  return response;
};

export default [mark];
