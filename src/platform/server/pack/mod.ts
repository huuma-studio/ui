import type { Middleware } from "@huuma/route/middleware";

import type { ContentSecurityPolicy } from "../content-security-policy.ts";
import type { PageLike, Resolver } from "../app.ts";
import type { Metadata, MetadataGenerator } from "../metadata.ts";

export type PageRoute = {
  page: Renderable;
  layouts: Renderable[];
  middleware: { default: Middleware[] }[];
};

type Renderable = {
  default: PageLike<unknown>;
  metadata?: Metadata | MetadataGenerator<unknown>;
  resolver?: Resolver<unknown>;
  contentSecurityPolicy?: ContentSecurityPolicy;
};

/**
 * An app's pages by route file path, and its remote functions by endpoint,
 * as the Vite plugin's virtual modules provide them (`virtual:huuma/routes`,
 * `virtual:huuma/remote`). `packPages()` and `serveRemoteFunctions()`
 * register them on the app.
 */
export interface List {
  pages: Record<string, PageRoute>;
  remoteFunctions?: Record<
    string,
    // deno-lint-ignore no-explicit-any
    Record<string, (...args: any[]) => Promise<any>>
  >;
}
