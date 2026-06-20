---
name: huuma-ui-islands-interactivity
description: Adding client interactivity to a Huuma UI app with `.client.tsx` islands, on-* events, refs, and hydration boundaries.
---

# Huuma UI Islands & Interactivity

Use this skill when the agent is adding client-side interactivity, creating a `.client.tsx` island, or debugging events/refs/hydration in a Huuma UI app.

## What is an island?

An island is a `.client.tsx` component that hydrates in the browser. Everything else is server-rendered. Islands are selectively hydrated by the framework runtime (browser side is `@huuma/ui/browser`; the JSX/hydration glue lives in `@huuma/ui/jsx-runtime`).

## Creating an island

- File must end in `.client.tsx`.
- Default export is the island component.
- Default export must **not** be `async` (lint `no-async-client-jsx`).
- Island code runs in the browser, so it must not import server-only modules such as `.server.ts`/`.server.tsx` files.

## Events: use `on-*`

Only kebab-cased `on-[a-z]+` event names are recognized:

- `on-click`, `on-input`, `on-submit`, `on-change`, `on-keydown`, etc.
- `onClick`, `onSubmit`, and camelCase variants silently do nothing.

See `@huuma/ui/jsx-runtime` (inspect with `deno doc jsr:@huuma/ui/jsx-runtime`).

## Sync-only hooks

Inside an island you can use `$`-hooks, but **only in synchronous scope**:

- `$signal`, `$computed`, `$effect`, `$mount`, `$destroy`, `$ref`, `$url`, `$route`, `$t`, etc.
- Do not call `$`-hooks inside `async` functions or after an `await`.
- Violations trigger the runtime error _"No sync vnode scope found"_ and lint `no-async-hook-calling` (enforced by `jsr:@huuma/ui/lint`). The hook scope is provided by `@huuma/ui/hooks/scope`.

## DOM refs with `$ref` and `bind`

- Create a ref with `$ref()` from `@huuma/ui/hooks/ref`.
- Attach it to an element with `bind={ref}` (or the framework's ref binding syntax).
- Access the value via `ref.get` (it is a getter, **not** `.get()` like signals).
- The ref type itself is exported from `@huuma/ui/ref`. Inspect either with `deno doc jsr:@huuma/ui/hooks/ref` / `deno doc jsr:@huuma/ui/ref`.

## Passing data to islands

- Islands receive props and children reconstructed during hydration.
- Props must be serializable for server-to-client transfer.
- Avoid putting non-serializable values (functions, DOM nodes) in props.

## Hydration checklist

- `root.tsx` must render `<Scripts>` and `<Launch>` (from `@huuma/ui/server`), otherwise islands never run.
- Island default export is sync, not `async`.
- `$`-hooks are called in sync render scope only.
- Events use `on-*` syntax.
