---
name: huuma-ui-app-and-build
description: Editing root.tsx, server.ts and vite.config.ts, the dev/prod workflow, environment variables, and building a Huuma UI app with Vite.
---

# Huuma UI App & Build

Use this skill when the agent is editing `root.tsx`, `server.ts` or `vite.config.ts`, setting up the dev or build workflow, or handling env vars in a Huuma UI app.

## App entry point

- Create the app with `createUIApp(root, options)` from `@huuma/ui/server`.
- `root` is the root page component, typically in `app/root.tsx`.
- The module named by `huuma({ server })` (default `server.ts`) must export the app as default: `export default createUIApp(Root);`. Otherwise the dev server and the built app fail with that hint.
- The app extends `@huuma/route` and uses the same routing/middleware patterns. Register middlewares, static routes etc. on it before exporting.
- Don't call `prepare()`, `list()`, `pack()` or `Deno.serve()`: the Vite plugin mounts the pages, islands and remote functions, and `server.js` serves the app.

## Vite config

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { huuma } from "@huuma/ui/vite";

export default defineConfig({ plugins: [huuma()] });
```

Options of `huuma()`:

- `routes` — directory of `page.tsx`/`layout.tsx`/`middleware.ts`, default `"app"`.
- `server` — module that exports the app, default `"server.ts"`.
- `decorators` — `"auto"` (default), `true` or `false`; standard decorators are compiled with Babel (the app installs `@babel/core` and `@babel/plugin-proposal-decorators`). Legacy decorators need `oxc: { decorator: { legacy: true } }`.

Vite compiles JSX for Huuma (automatic runtime). For the editor, `tsconfig.json` sets `"jsx": "react-jsx"` and `"jsxImportSource": "@huuma/ui"`. Precompiled JSX (`"jsx": "precompile"`) isn't supported.

## Required shell in `root.tsx`

`root.tsx` must render the Huuma shell components (all imported from `@huuma/ui/server`):

- `<Meta metadata={metadata} />` — renders page metadata.
- `<Scripts scripts={scripts?.head} nonce={scripts?.nonce} />` — head scripts.
- `<Scripts scripts={scripts?.body} nonce={scripts?.nonce} />` — body scripts.
- `<Launch body={scripts?.body} islands={islands} transferState={transferState} nonce={scripts?.nonce} />` — launches the client runtime so islands hydrate.

If `<Launch>` is missing, islands never hydrate. Keep the `nonce` props: the app's Content-Security-Policy only allows scripts with the page's nonce.

## Dev vs prod

- **Dev:** `vite` (or `vp dev`). Edited islands update in place and keep their state while their hooks stay the same; other edits rebuild the app and reload the page.
- **Build:** `vite build` writes `dist/client/` (browser runtime, islands, `public/`) and `dist/server/` (`app.js`, the app's `fetch` handler; `server.js`, the Node server; `worker.js`, the Cloudflare Worker).
- **Prod:** `node dist/server/server.js`, with `PORT` (default 8000), `HOST` and `HUUMA_ENV=PROD`. It serves `dist/client/` and the app below Vite's `base`.
- `app.js` alone doesn't serve `dist/client/`: on another server (`deno serve`, Bun), serve those files too.
- **Deno:** `deno run -A npm:vite`, `deno run -A npm:vite build`, `deno run -A dist/server/server.js`, with a `package.json` and `node_modules`.
- **Cloudflare Workers:** `wrangler.jsonc` with `"main": "dist/server/worker.js"` and `"assets": { "directory": "dist/client" }`; below a `base` other than `/`, add `"binding": "ASSETS"` to `assets`. Try it with `wrangler dev`, then `wrangler deploy`. The build writes `_headers` (caching) and `.assetsignore` (keeps `.vite/` private) into `dist/client/`. Bindings (KV, D1, R2) reach middleware as `ctx.env`, not pages or remote functions.

## Environment variables

- `PUBLIC_*` variables (environment and `.env` files) are available as `import.meta.env.PUBLIC_*` in the browser and on the server.
- Other variables stay on the server (`process.env`); use them in `.remote.ts`, `*.server.*` modules or server components.
- `Deno.env.get()` still works for one minor version, with a deprecation warning; replace it with `import.meta.env`.

## Static files and CSS

- Files in `public/` are served as they are, in dev and by `server.js`.
- CSS imported by islands or pages isn't supported yet: put stylesheets in `public/` and link them in `root.tsx`, or use `app.addStylesheet()`.

## Lint plugin

- Configure `@huuma/ui/lint` in Oxlint (`"jsPlugins": ["@huuma/ui/lint"]` in `.oxlintrc.json`), ESLint (`huuma.configs.recommended`) or `deno lint` (`"lint": { "plugins": ["jsr:@huuma/ui/lint"] }`) so the boundary rules are enforced:
  - every value export of a `.remote.ts` module is an async function.
  - `$`-hooks cannot run in `async` components.
  - `.client.tsx` default export cannot be `async`.

## Things to check

- `server.ts` (or the `server` option) default-exports the app.
- `root.tsx` contains `<Meta>`, `<Scripts>` and `<Launch>` with the `nonce`.
- `vite.config.ts` uses `huuma()`; no `prepare()`/`pack()`/`.huuma/` left from 0.2.
- `PUBLIC_` env vars only on the client.
- `dist/` is build output and ignored by version control.
