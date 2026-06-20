# Plan: Agent Skills for `@huuma/ui`

> Goal: ship a set of **skills for coding agents** that build apps with the Huuma UI
> framework. Each skill encodes the non-obvious, *enforced* rules and conventions an
> agent would otherwise get wrong, and surfaces the relevant information at the right
> moment (by task or by error).

## 1. Context

Huuma UI is a Deno, file-convention web framework: server-side rendering + selective
hydration ("islands") + type-safe remote server functions + signal-based reactivity +
built-in i18n. Status is **Developer Preview** (`v0.2.3`) — APIs change, and the
[README](README.md) is explicitly flagged as possibly outdated.

The high-value targets for skills are **not** the happy-path snippets in the README —
they are the rules the framework *enforces* via the [lint plugin](src/lint/mod.ts) and
runtime errors. That enforcement is the clearest signal of "things agents need help
with." (Evidence the README drifts: its form example uses `onSubmit`, but the runtime
only binds hyphenated `on-*` events — see [event.ts](src/jsx-runtime/event.ts:2).)

**Source-of-truth rule:** when README and code disagree, trust the lint rules + code.

## 2. Framework map (research findings)

| Subsystem | Key files | What agents author against |
| --- | --- | --- |
| File conventions / routing | [list.ts](src/platform/server/pack/list/list.ts), [path-mapping.ts](src/platform/server/pack/path-mapping.ts) | `app/` dir, `page.tsx`/`layout.tsx`/`middleware.ts`, `[param]`, `(group)`, `!404` |
| Server app + shell | [app.ts](src/platform/server/app.ts), [scripts.ts](src/platform/server/scripts.ts), [meta.ts](src/platform/server/meta.ts) | `createUIApp`, `root.tsx`, `<Meta>`/`<Scripts>`/`<Launch>` |
| Build / "pack" | [pack/mod.ts](src/platform/server/pack/mod.ts), [list/mod.ts](src/platform/server/pack/list/mod.ts) | `prepare()` (dev), `pack()` (prod), `.huuma/` output, `--bundle` |
| Islands / hydration | [islands.ts](src/islands/islands.ts), [browser/mod.ts](src/platform/browser/mod.ts) | `.client.tsx`, `on-*` events, `bind` |
| Signals / state | [signal/mod.ts](src/signal/mod.ts), [hooks/signal.ts](src/hooks/signal.ts), [store/mod.ts](src/store/mod.ts) | `$signal`/`$computed`/`$effect`, `createStore` |
| Lifecycle / refs | [hooks/lifecycle.ts](src/hooks/lifecycle.ts), [ref/mod.ts](src/ref/mod.ts), [hooks/ref/mod.ts](src/hooks/ref/mod.ts) | `$mount`/`$destroy`, `$ref` |
| Remote functions | [pack.ts](src/platform/server/pack/pack.ts:112) | `.remote.ts`, `export async function` |
| Data / scope hooks | [scope.ts](src/hooks/scope.ts), [metadata.ts](src/platform/server/metadata.ts) | `resolver()`, `PageLikeProps`, `$url`/`$route`, `metadata` |
| i18n | [i18n/mod.ts](src/i18n/mod.ts), [middleware/mod.ts](src/i18n/middleware/mod.ts) | `setupI18n`, `useI18n`, `<T>`, `$t` |
| Security (CSP) | [content-security-policy.ts](src/platform/server/content-security-policy.ts) | per-page `contentSecurityPolicy`, nonce |
| Lint (enforced rules) | [lint/mod.ts](src/lint/mod.ts) | the 3 boundary rules below |

### The enforced boundary rules (the crux)

1. `.remote.ts` exports **must be `export async function`** — lint `async-remote-functions` ([lint/mod.ts:5](src/lint/mod.ts:5)).
2. `$`-hooks run **only in sync island scope**, never in async components — lint `no-async-hook-calling` ([lint/mod.ts:24](src/lint/mod.ts:24)); runtime throws *"No sync vnode scope found"* ([scope.ts:20](src/hooks/scope.ts:20)).
3. Island (`.client.tsx`) default export **cannot be `async`** — lint `no-async-client-jsx` ([lint/mod.ts:41](src/lint/mod.ts:41)).
4. Server components (`page`/`layout`) **may** be `async` and `await` data (e.g. `resolver()`).

### High-value gotchas (encode these verbatim)

- **Events:** only `on-[a-z]+` is recognized (`on-click`, `on-input`, `on-submit`). `onClick`/`onSubmit` silently do nothing ([event.ts:2](src/jsx-runtime/event.ts:2)).
- **Signals vs refs:** signals use `.get()`/`.set()` **methods** ([signal/mod.ts:48](src/signal/mod.ts:48)); refs use `.get`/`.set` **accessors** (no parens, [ref/mod.ts:7](src/ref/mod.ts:7)). `set` short-circuits when value is `===` ([signal/mod.ts:57](src/signal/mod.ts:57)).
- **Routing:** `[param]` → `:param`, `(group)` stripped from URL, `!404` → `/*` catch-all 404 ([path-mapping.ts](src/platform/server/pack/path-mapping.ts)). Layouts auto-apply by directory nesting. Routes live in **`app/`, not `pages/`** (renamed in commit `9d71791`).
- **Hydration:** `root.tsx` must render `<Launch>` (plus `<Scripts>`) or islands never hydrate ([scripts.ts:46](src/platform/server/scripts.ts:46)).
- **Remote calls:** JSON-serializable args only; compile to `POST /_huuma/remote/<hash>/<fn>` validated by `@huuma/validate` ([pack.ts:112](src/platform/server/pack/pack.ts:112)). Known stub limits: no `res.ok` check; `undefined` returns break client parsing ([improvements.md](improvements.md)).
- **Env vars:** only `PUBLIC_`-prefixed vars are shimmed into client bundles ([list/mod.ts:167](src/platform/server/pack/list/mod.ts:167)).
- **Generated `.huuma/`** (manifest `list.ts` + scripts) is build output — never hand-edit.
- **i18n:** URLs must lead with `/<lang>` or redirect/throw; `<T name="a.b.c">` resolves nested keys with `{{param}}` interpolation.

## 3. Proposed skill set

| # | Skill | Triggers when the agent is… | Priority |
| --- | --- | --- | --- |
| 1 | `huuma-ui-foundation` | Starting/working anywhere in a Huuma project | ★ Core (entry/index) |
| 2 | `huuma-ui-routing-and-data` | Adding pages, layouts, routes, data loading, SEO | ★ Core |
| 3 | `huuma-ui-islands-interactivity` | Adding client interactivity / a `.client.tsx` | ★ Core |
| 4 | `huuma-ui-signals-and-state` | Managing reactive state inside islands | ★ Core |
| 5 | `huuma-ui-remote-functions` | Adding server functions / mutations / form handling | ★ Core |
| 6 | `huuma-ui-app-and-build` | Editing `root.tsx`, entry points, build/dev setup | High |
| 7 | `huuma-ui-i18n` | Adding/using translations | Medium |
| 8 | `huuma-ui-troubleshooting` | Hitting a Huuma error or lint violation | High (reactive) |

Optional / future: `huuma-ui-security-csp`, `huuma-ui-styling`, `huuma-route-http`
(the underlying `@huuma/route` HTTP layer: middleware, ctx, auth, exceptions).

### 1. `huuma-ui-foundation` — mental model & conventions
- **Trigger:** "building a Huuma UI app", "Deno web framework", any repo importing `@huuma/ui`. Index skill that cross-links the others.
- **Scope:** directory layout (`app/` routes, `src/`, `root.tsx`, `dev.ts`/`app.ts`); the filename-suffix language (`page`/`layout`/`middleware`, `.client.tsx`, `.remote.ts`, `[param]`/`(group)`/`!404`); the server/client boundary + the 4 boundary rules; the generated `.huuma/` dir; dev workflow + permission flags.
- **Sources:** [list.ts](src/platform/server/pack/list/list.ts), [lint/mod.ts](src/lint/mod.ts), [example/deno.json](example/deno.json).

### 2. `huuma-ui-routing-and-data`
- **Trigger:** adding a page/route/layout, dynamic params, data loading, page metadata.
- **Scope:** file-based routing in `app/`; nested layouts; dynamic `[param]`, groups `(group)`, `!404`; `PageLikeProps` (`params`, `searchParams`, `request`, `auth`, `data`, `resolved`); `resolver()` for async data; `metadata`/`MetadataGenerator` for SEO; per-page `contentSecurityPolicy` and `middleware` exports; `$url`/`$route`.
- **Sources:** [app.ts](src/platform/server/app.ts), [pack.ts](src/platform/server/pack/pack.ts), [metadata.ts](src/platform/server/metadata.ts), [scope.ts](src/hooks/scope.ts), example `app/test/**`.

### 3. `huuma-ui-islands-interactivity`
- **Trigger:** making something interactive, creating a `.client.tsx`.
- **Scope:** what an island is and when to use one; the **sync-only** constraint; **`on-*` event syntax** (`onClick`/`onSubmit` won't bind); DOM refs via `$ref` + `bind={ref}` (`ref.get` is a property); passing props/children into islands and how hydration reconstructs them.
- **Sources:** [islands.ts](src/islands/islands.ts), [browser/mod.ts](src/platform/browser/mod.ts), [jsx.ts](src/jsx-runtime/jsx.ts), [event.ts](src/jsx-runtime/event.ts), example `*.client.tsx`.

### 4. `huuma-ui-signals-and-state`
- **Trigger:** reactive state, computed values, side effects, stores, component lifecycle.
- **Scope:** `$signal`/`$computed`/`$effect` with the `.get()`/`.set()` API (`set` short-circuits on `===`); `$mount` (returns cleanup) / `$destroy`; `untracked`; `createStore` with optional `localStorage` persistence. Explicitly contrast signals (`.get()`) vs refs (`.get`).
- **Sources:** [signal/mod.ts](src/signal/mod.ts), [hooks/signal.ts](src/hooks/signal.ts), [hooks/lifecycle.ts](src/hooks/lifecycle.ts), [store/mod.ts](src/store/mod.ts).

### 5. `huuma-ui-remote-functions`
- **Trigger:** server-side mutations, form submissions, calling the backend.
- **Scope:** `.remote.ts`; **must be `export async function`**; **JSON-serializable args only**; import + call directly from an island (compiles to `POST /_huuma/remote/<hash>/<fn>`); validation via `@huuma/validate`; input validation, error handling, known stub limitations; secrets/DB belong here.
- **Sources:** [pack.ts](src/platform/server/pack/pack.ts), example `src/test.remote.ts`, [improvements.md](improvements.md).

### 6. `huuma-ui-app-and-build`
- **Trigger:** editing `root.tsx`, configuring entry points, build/dev/deploy, env vars, static files.
- **Scope:** `createUIApp` + required shell (`<Meta>`, head/body `<Scripts>`, `<Launch>`); `prepare()` (dev, auto-discovers) vs `pack()` (prod, takes `List`) + `--bundle`; `deno task dev/bundle/start` + permission flags; `PUBLIC_` env-var shimming; live reload; lint-plugin setup in `deno.json`.
- **Sources:** [app.ts](src/platform/server/app.ts), [pack/mod.ts](src/platform/server/pack/mod.ts), [list/mod.ts](src/platform/server/pack/list/mod.ts), example entry points.

### 7. `huuma-ui-i18n`
- **Trigger:** translations, multilingual routing.
- **Scope:** `setupI18n` + `useI18n` middleware; URL must lead with `/<lang>`; `<T name="a.b.c" props={{...}}/>` nested keys + `{{param}}`; `$t`/`$activeLang`/`$languages`; `dangerouslyInnerHTML` variant; redirect middleware for missing/unsupported language.
- **Sources:** [i18n/mod.ts](src/i18n/mod.ts), [i18n/middleware/mod.ts](src/i18n/middleware/mod.ts).

### 8. `huuma-ui-troubleshooting` (reactive)
- **Trigger:** a Huuma error/lint message — *"No sync vnode scope found"*, *"hooks not allowed in async components"*, *"remote function MUST be an async function export"*, *"client-side does not support async jsx"*, island not hydrating, event not firing.
- **Scope:** a symptom → cause → fix table mapping each lint rule and runtime throw to the boundary rule it enforces and the corrective edit. Catches mistakes after the fact even when a proactive skill didn't trigger.
- **Sources:** [lint/mod.ts](src/lint/mod.ts), [scope.ts](src/hooks/scope.ts), [i18n/mod.ts](src/i18n/mod.ts).

## 4. Architecture & format decisions

- **Format:** mirror the existing [grill-with-docs/SKILL.md](grill-with-docs/SKILL.md) — `name` + `description` frontmatter + concise body. The `description` is the trigger and matters most; phrase around *tasks* ("add interactivity", "load data for a page"), not internals.
- **Progressive disclosure:** `huuma-ui-foundation` is a lightweight router that cross-links the deep skills, so only the relevant one loads per task. Keeps each skill small and focused.
- **Placement:** ship in this repo (e.g. a `skills/` dir) so downstream Huuma apps inherit them; foundation + troubleshooting double as the basis for a future `CLAUDE.md` / docs site (Epic 04).
- **Source of truth:** lint rules + code over README.

## 5. Out of scope (do NOT make skills for)

Internal mechanics agents never author against: the v-node diff/hydrate engine
([src/platform/browser/diff](src/platform/browser/diff)), the esbuild bundler internals
([bundler.ts](src/platform/server/pack/list/bundler.ts)), transfer-state plumbing.
These belong in contributor docs, not consumer skills.

## 6. Suggested build order

1. `huuma-ui-foundation` (entry point + boundary rules)
2. `huuma-ui-troubleshooting` (highest reactive leverage)
3. `huuma-ui-islands-interactivity` + `huuma-ui-signals-and-state`
4. `huuma-ui-remote-functions`
5. `huuma-ui-routing-and-data`
6. `huuma-ui-app-and-build`
7. `huuma-ui-i18n`
8. Optional: `huuma-ui-security-csp`, `huuma-ui-styling`, `huuma-route-http`

## 7. Open questions

- Distribution: bundle skills in this repo, or publish separately for consumer apps?
- Granularity: keep CSP inside routing/app skills, or split `huuma-ui-security-csp` out?
- Should the boundary rules also live in a root `CLAUDE.md`/`AGENTS.md` for always-on enforcement (vs. only triggered skills)?
