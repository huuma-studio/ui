---
name: huuma-ui-app-and-build
description: Editing root.tsx, entry points, dev/prod workflow, environment variables, and the Huuma UI build pipeline.
---

# Huuma UI App & Build

Use this skill when the agent is editing `root.tsx`, configuring entry points, setting up the dev or build workflow, or handling env vars and live reload in a Huuma UI app.

## App entry point

- Create the app with `createUIApp(root, options)` from `@huuma/ui/server`.
- `root` is the root page component, typically in `root.tsx`.
- The app extends `@huuma/route` and uses the same routing/middleware patterns.
- See the README "Server Setup with Layouts" section for a complete `createUIApp` example.

## Required shell in `root.tsx`

`root.tsx` must render the Huuma shell components (all imported from `@huuma/ui/server`):

- `<Meta />` — renders page metadata.
- `<Scripts head />` — head scripts.
- `<Scripts />` — body scripts.
- `<Launch />` — launches the client runtime so islands hydrate.

If `<Launch>` is missing, islands never hydrate.

## Dev vs prod

- **Dev:** call `prepare(app, options)` from `@huuma/ui/server/pack/list` (auto-discovers routes, does not bundle).
- **Prod:** call `list(app, { isProd: true, routesPath })` then `pack(app, list)` from `@huuma/ui/server/pack`. Triggered via `--bundle` flag.
- The generated `.huuma/` directory contains the manifest (`list.ts`) and bundled scripts. Never hand-edit it.

## Build commands

Typical `deno.json` tasks (scaffolded by `huuma project`):

- `deno task dev` — run `prepare()` in dev mode.
- `deno task bundle` — run with `--bundle` flag and `pack()`.
- `deno task start` — start the production server.
- Check your own project's `deno.json` for the exact permission flags and commands.

## Environment variables

- Only environment variables prefixed with `PUBLIC_` are shimmed into client bundles.
- Server-only secrets must stay server-only and be used in `.remote.ts` or server components.
- Public env vars are injected via a shim file generated under `.huuma/shims/` during `pack()` (the build step in `@huuma/ui/server/pack`).

## Live reload

- `enableLiveReload(app)` bundles a live-reload client and registers a `/_websocket` route.
- It runs an async bundle; be aware of concurrency with the main build.

## Lint plugin

- Add the Huuma lint plugin to your `deno.json` (`"lint": { "plugins": ["jsr:@huuma/ui/lint"] }`) so the boundary rules are enforced:
  - `.remote.ts` exports must be `export async function`.
  - `$`-hooks cannot run in `async` components.
  - `.client.tsx` default export cannot be `async`.

## Things to check

- `root.tsx` contains `<Meta>`, `<Scripts>`, and `<Launch>`.
- Dev entry point uses `prepare()`; prod uses `--bundle` + `pack()`.
- `PUBLIC_` env vars only on the client.
- `.huuma/` is generated and ignored by version control.
