// Bindings typed from one augmentation, as the README shows it with
// `wrangler types`, which declares the global `Cloudflare.Env`.
import { expectTypeOf, test } from "vite-plus/test";

import { createUIApp, type Env, requestContext } from "@huuma/ui/server";

interface KVNamespace {
  get(key: string): Promise<string | null>;
}

declare global {
  namespace Cloudflare {
    interface Env {
      SESSIONS: KVNamespace;
    }
  }
}

declare module "@huuma/ui/server" {
  interface Env extends Cloudflare.Env {}
}

test("requestContext().env has the app's bindings, without generics", () => {
  expectTypeOf<ReturnType<typeof requestContext>["env"]>().toEqualTypeOf<Env>();
  expectTypeOf<Env["SESSIONS"]>().toEqualTypeOf<KVNamespace>();
  expectTypeOf<Env>().not.toHaveProperty("UNDECLARED");
});

test("so has ctx.env in the app's middleware", () => {
  const app = createUIApp(() => null);
  app.use((ctx, next) => {
    expectTypeOf(ctx.env.SESSIONS).toEqualTypeOf<KVNamespace>();
    return next();
  });
});
