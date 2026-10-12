import type { Middleware } from "@huuma/route/middleware";

// Marks every response, so tests can see that middlewares run.
const mark: Middleware = async (ctx, next) => {
  // A response whose body fails after it started, for the dev server tests.
  if (new URL(ctx.request.url).pathname === "/stream-error") {
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<p>partial"));
          setTimeout(() => controller.error(new Error("stream failed")), 20);
        },
      }),
      { headers: { "content-type": "text/plain" } },
    );
  }
  const response = await next();
  response.headers.set("x-fixture-middleware", "app");
  return response;
};

export default [mark];
