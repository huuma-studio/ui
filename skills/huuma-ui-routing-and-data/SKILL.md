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
- `app/!404/page.tsx` — the page for `GET` and `HEAD` requests no route answers, with status 404 (also when a page throws `NotFoundException`). Not a route: other methods get `404`. `app/blog/!404/page.tsx` answers below `/blog/`; the deepest one wins.
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

Code that doesn't get these props, such as a `*.server.ts` helper, a resolver or `metadata()`, reads the request with `requestContext()` from `@huuma/ui/server` (`request`, `params`, `searchParams`, `auth`, `env`, `connection`, `waitUntil()`). Not in islands: they render in the browser too (lint `no-request-context-in-islands`).

See the `PageLikeProps` type exported from `@huuma/ui/server` (inspect with `deno doc jsr:@huuma/ui/server`).

## Data loading with `resolver()`

- Server components (`page`/`layout`) may be `async` and can `await resolver(...)`.
- `resolver()` is exported from `@huuma/ui/hooks/scope` and used to load async data before rendering.
- Resolvers are collected and executed before the page renders; results are available in `data`/`resolved`.

## Metadata & SEO

- Export `metadata` or a `MetadataGenerator` from `page.tsx`/`layout.tsx`.
- Type definitions live in `@huuma/ui/server` (the `Metadata` types are re-exported there; inspect with `deno doc jsr:@huuma/ui/server`).
- Use `<Meta>` (from `@huuma/ui/server`) inside `root.tsx` to render metadata.
- `metadata.headers` sets the page's response headers. Outside production (`NODE_ENV=production` or `HUUMA_ENV=PROD`), `Cache-Control` and `Expires` are left out, so the browser doesn't show a stale page while developing; the others are always sent.

## Middleware

- Export `default` (an array of middleware) from `app/middleware.ts`.
- Middleware runs for all nested routes in that directory.
- Middleware is defined by `@huuma/route` and receives `ctx`.
- Page middleware doesn't run for remote functions. App-wide middleware (`app.use()` in `server.ts`) runs for pages and remote functions: put auth there and set `ctx.auth`.

## Scope hooks

Inside islands, `$url` and `$route` give access to URL/route state (exported from `@huuma/ui/hooks/scope`). The README "URL/Route Access in Components" section shows a `$url()` example.

## Things to check

- No `async` default exports in `.client.tsx`.
- `$`-hooks are only used in sync island scope.
- Route paths use `app/`, not `pages/`.
- `(group)` does not appear in the URL; `[param]` becomes `:param`; `!404` is a not-found page for its directory, not a route.
