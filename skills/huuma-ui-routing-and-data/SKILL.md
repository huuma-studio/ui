---
name: huuma-ui-routing-and-data
description: Adding Huuma UI pages, layouts, routes, dynamic params, data loading with resolvers, metadata, and middleware.
---

# Huuma UI Routing & Data

Use this skill when the agent is adding or editing routes, pages, layouts, dynamic params, data loading, metadata, or middleware in a Huuma UI app.

## File-based routing

Routes are files under `app/`:

- `app/page.tsx` — route at `/`.
- `app/[param]/page.tsx` — dynamic route mapped to `/:param`.
- `app/(group)/page.tsx` — grouping directory, stripped from the URL.
- `app/!404/page.tsx` — catch-all 404 route, mapped to `/*` (path-mapping is handled internally by `@huuma/ui/server/pack` during the build).
- `app/layout.tsx` — applies to all nested pages under its directory.
- `app/middleware.ts` — middleware for nested routes.

Layouts auto-apply by directory nesting. A page gets every layout whose directory is a prefix of the page's path.

## Page component props

Server `page.tsx` and `layout.tsx` components receive `PageLikeProps`:

- `params` — route parameters.
- `searchParams` — query string.
- `request` — the raw `Request`.
- `auth` — auth context.
- `data` — resolved data.
- `resolved` — resolver outputs.

See the `PageLikeProps` type exported from `@huuma/ui/server` (inspect with `deno doc jsr:@huuma/ui/server`).

## Data loading with `resolver()`

- Server components (`page`/`layout`) may be `async` and can `await resolver(...)`.
- `resolver()` is exported from `@huuma/ui/hooks/scope` and used to load async data before rendering.
- Resolvers are collected and executed before the page renders; results are available in `data`/`resolved`.

## Metadata & SEO

- Export `metadata` or a `MetadataGenerator` from `page.tsx`/`layout.tsx`.
- Type definitions live in `@huuma/ui/server` (the `Metadata` types are re-exported there; inspect with `deno doc jsr:@huuma/ui/server`).
- Use `<Meta>` (from `@huuma/ui/server`) inside `root.tsx` to render metadata.

## Middleware

- Export `default` (an array of middleware) from `app/middleware.ts`.
- Middleware runs for all nested routes in that directory.
- Middleware is defined by `@huuma/route` and receives `ctx`.

## Scope hooks

Inside islands, `$url` and `$route` give access to URL/route state (exported from `@huuma/ui/hooks/scope`). The README "URL/Route Access in Components" section shows a `$url()` example.

## Things to check

- No `async` default exports in `.client.tsx`.
- `$`-hooks are only used in sync island scope.
- Route paths use `app/`, not `pages/`.
- `(group)` does not appear in the URL; `[param]` becomes `:param`; `!404` becomes `/*`.
