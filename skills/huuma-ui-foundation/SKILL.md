---
name: huuma-ui-foundation
description: Building or navigating a Huuma UI app — file conventions, server/client boundary rules, dev workflow, and where to look for authoritative answers.
---

# Huuma UI Foundation

Use this skill when the agent is working anywhere in a Huuma UI project. It is the lightweight router: point the user to the right deeper skill and enforce the framework's non-obvious rules.

## Mental model

Huuma UI is a Deno, file-convention web framework: server-side rendering + selective hydration ("islands") + type-safe remote server functions + signal-based reactivity + built-in i18n. Status is Developer Preview (`v0.2.3`); APIs change.

Clients consume it as `jsr:@huuma/ui` — you do **not** have the library's source in your project. To inspect any API, run `deno doc jsr:@huuma/ui/<subpath>` (e.g. `deno doc jsr:@huuma/ui/server`) or use "Go to Definition" in your editor; the public subpaths are listed in the package's `deno.json` exports (`.`, `/server`, `/server/pack`, `/server/pack/list`, `/browser`, `/ref`, `/signal`, `/hooks/lifecycle`, `/hooks/signal`, `/hooks/ref`, `/hooks/scope`, `/jsx-runtime`, `/i18n`, `/i18n/middleware`, `/lint`, `/v-node`, `/v-node/sync`).

**Source-of-truth rule:** when the README and the framework disagree, trust the lint plugin (`jsr:@huuma/ui/lint` configured in your `deno.json`) and the runtime error messages — not the README, which may lag behind releases.

## Directory layout

- Routes live in `app/` (not `pages/`; renamed in commit `9d71791`).
- `app/page.tsx` — page route.
- `app/layout.tsx` — nested layout.
- `app/middleware.ts` — route middleware.
- `app/[param]/page.tsx` — dynamic parameter.
- `app/(group)/` — grouping directory, stripped from URL.
- `app/!404/page.tsx` — catch-all 404 route, mapped to `/*`.
- `root.tsx` — root shell component.
- `.huuma/` — generated build output (manifest `list.ts` + scripts). Never hand-edit.

## The four enforced boundary rules

1. `.remote.ts` exports must be `export async function` (lint `async-remote-functions`).
2. `$`-hooks (`$signal`, `$effect`, `$mount`, `$ref`, …) run only in **sync** island scope, never in `async` components (lint `no-async-hook-calling`).
3. `.client.tsx` default export cannot be `async` (lint `no-async-client-jsx`).
4. Server components (`page`/`layout`) may be `async` and can `await` data.

## Conventions to enforce

- Use kebab-cased `on-*` events in JSX: `on-click`, `on-input`, `on-submit`. `onClick`/`onSubmit` silently do nothing (behavior of `@huuma/ui/jsx-runtime`).
- `root.tsx` must render `<Scripts>` and `<Launch>` (from `@huuma/ui/server`) or islands never hydrate.
- Only `PUBLIC_`-prefixed environment variables are shimmed into client bundles.
- Generated `.huuma/` is build output — never edit by hand.

## Dev workflow

- `deno task dev` uses `prepare()` (dev mode, auto-discovers routes).
- `deno task bundle` uses `--bundle` and calls `pack()` (prod mode, takes a `List`).
- Permissions matter; check the `deno.json` in your own project for the standard `dev`/`bundle`/`start` task definitions and permission flags (the `huuma project` CLI scaffold sets these up).

## Cross-links

Route the user (and load the matching skill) when the task is specifically about:

- Pages/routes/layouts/data → `huuma-ui-routing-and-data`
- `.client.tsx` interactivity → `huuma-ui-islands-interactivity`
- Signals/lifecycle → `huuma-ui-signals-and-state`
- `.remote.ts` server mutations → `huuma-ui-remote-functions`
- `root.tsx`, entry points, build, env vars → `huuma-ui-app-and-build`
- Translations / multilingual URLs → `huuma-ui-i18n`
- A Huuma error or lint violation → `huuma-ui-troubleshooting`
