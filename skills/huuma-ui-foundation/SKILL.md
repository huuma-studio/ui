---
name: huuma-ui-foundation
description: Building or navigating a Huuma UI app — file conventions, server/client boundary rules, dev workflow, and where to look for authoritative answers.
---

# Huuma UI Foundation

Use this skill when the agent is working anywhere in a Huuma UI project. It is the lightweight router: point the user to the right deeper skill and enforce the framework's non-obvious rules.

## Mental model

Huuma UI is a file-convention web framework: server-side rendering + selective hydration ("islands") + type-safe remote server functions + signal-based reactivity + built-in i18n. Apps build with Vite 8 through the `@huuma/ui/vite` plugin and run on Node.js 24+; Deno works too (best effort). Status is Developer Preview (`v0.3`); APIs change.

Version check: a project with `vite.config.ts` and `huuma()` uses 0.3 (this skill set). A project with `dev.ts`/`app.ts` calling `prepare()`/`pack()` and `deno task dev` is on 0.2, the Deno setup; the README's "Migrating from the Deno Setup" section moves it to Vite.

Clients consume it as `@huuma/ui` from JSR (`jsr:@huuma/ui` with pnpm/Yarn, `@jsr/huuma__ui` through `npx jsr add`) — you do **not** have the library's source in your project. To inspect any API, use "Go to Definition" in your editor, the docs at `https://jsr.io/@huuma/ui/doc/<subpath>`, or `deno doc jsr:@huuma/ui/<subpath>` if Deno is installed. The public subpaths are listed in the package's `deno.json` exports (`.`, `/server`, `/browser`, `/ref`, `/signal`, `/hooks/lifecycle`, `/hooks/signal`, `/hooks/ref`, `/hooks/scope`, `/jsx-runtime`, `/jsx-dev-runtime`, `/i18n`, `/i18n/middleware`, `/lint`, `/vite`, `/vite/node`, `/v-node`, `/v-node/sync`; `/vite/runtime` is internal to the plugin).

**Source-of-truth rule:** when the README and the framework disagree, trust the lint plugin (`@huuma/ui/lint` in Oxlint, ESLint or `deno lint`) and the runtime and build error messages — not the README, which may lag behind releases.

## Directory layout

- Routes live in `app/` (the `routes` option of `huuma()`; not `pages/`).
- `app/page.tsx` — page route.
- `app/layout.tsx` — nested layout.
- `app/middleware.ts` — route middleware.
- `app/[param]/page.tsx` — dynamic parameter.
- `app/(group)/` — grouping directory, stripped from URL.
- `app/!404/page.tsx` — catch-all 404 route, mapped to `/*`.
- `app/root.tsx` (or anywhere) — root shell component, passed to `createUIApp()`.
- `server.ts` — exports the app as default (the `server` option of `huuma()`).
- `*.client.tsx` anywhere — islands; `*.remote.ts` — remote functions; `*.server.*` — server-only modules.
- `public/` — static files, served as they are.
- `vite.config.ts` — Vite config with the `huuma()` plugin.
- `dist/` — build output (`vite build`). Never hand-edit.

## The four enforced boundary rules

1. Every value export of a `.remote.ts` module must be an async function (lint `async-remote-functions`).
2. `$`-hooks (`$signal`, `$effect`, `$mount`, `$ref`, …) run only in **sync** island scope, never in `async` components (lint `no-async-hook-calling`).
3. `.client.tsx` default export cannot be `async` (lint `no-async-client-jsx`).
4. Server components (`page`/`layout`) may be `async` and can `await` data.

## Conventions to enforce

- Use kebab-cased `on-*` events in JSX: `on-click`, `on-input`, `on-submit`. `onClick`/`onSubmit` silently do nothing (behavior of `@huuma/ui/jsx-runtime`). Attributes go to HTML as written: `class` and `for`, not `className` and `htmlFor`.
- `root.tsx` must render `<Scripts>` and `<Launch>` (from `@huuma/ui/server`) or islands never hydrate.
- Only `PUBLIC_`-prefixed environment variables reach the browser, as `import.meta.env.PUBLIC_*`.
- Browser code must not import `*.server.*` modules; the dev server and the build fail, naming the importer.

## Dev workflow

- `vite` (or `pnpm dev`) — dev server with hot updates; edited islands keep their state.
- `vite build` — builds `dist/client/` and `dist/server/` (`app.js`, and `server.js` for Node).
- `node dist/server/server.js` — production server (`PORT`, `HOST`).
- On Deno: `deno run -A npm:vite`, `deno run -A npm:vite build`, `deno run -A dist/server/server.js`.
- On Cloudflare Workers: `huuma({ adapter: cloudflare() })` from `@huuma/cloudflare`, then `vite build` and `wrangler deploy` (see `huuma-ui-app-and-build`).

## Cross-links

Route the user (and load the matching skill) when the task is specifically about:

- Pages/routes/layouts/data → `huuma-ui-routing-and-data`
- `.client.tsx` interactivity → `huuma-ui-islands-interactivity`
- Signals/lifecycle → `huuma-ui-signals-and-state`
- `.remote.ts` server mutations → `huuma-ui-remote-functions`
- `root.tsx`, `server.ts`, Vite config, build, env vars → `huuma-ui-app-and-build`
- Translations / multilingual URLs → `huuma-ui-i18n`
- A Huuma error or lint violation → `huuma-ui-troubleshooting`
