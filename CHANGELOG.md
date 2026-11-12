# Changelog

Notable changes to `@huuma/ui`, newest first. Versions before 0.3.0 have no entry here.

## 0.3.0 (unreleased)

Huuma UI now builds with [Vite 8](https://vite.dev) and runs on Node.js. Deno still works, and Cloudflare Workers are supported through [`@huuma/cloudflare`](https://jsr.io/@huuma/cloudflare).

Coming from 0.2, follow [Migrating from the Deno Setup](README.md#migrating-from-the-deno-setup) in the README. This entry covers the pre-releases `0.3.0-beta.1` to `0.3.0-beta.7`.

### Breaking changes

**Build and runtime**

- The Deno build pipeline is removed: `@huuma/ui/server/pack` and `@huuma/ui/server/pack/list` (`pack()`, `prepare()`, `list()`), the `.huuma/` directory and `--bundle`. Apps build with Vite and the `huuma()` plugin from `@huuma/ui/vite`.
- Node.js 24 or later and Vite 8 are required. Node.js is the supported runtime; Deno is best effort.
- Precompiled JSX (`"jsx": "precompile"`) isn't supported. Vite compiles JSX with the automatic runtime.
- Static files move from `static/` and `loadStaticFiles(app)` to Vite's `public/` directory.
- `PUBLIC_*` environment variables are read from `import.meta.env`. `Deno.env.get()` keeps working for one more minor version, with a deprecation warning.

**Remote functions**

- They answer only the requests the generated stub sends: a request without `Content-Type: application/json` gets `415`, and one a browser marks as cross-site gets `403`. This stops other sites from calling them with a visitor's cookies.
- A request can be 1 MiB at most; a larger one gets `413`. Set another limit with `createUIApp(Root, { remote: { maxBodySize } })`.

**Rendering**

- The server and the browser write attributes by one set of rules, described under [Attributes](README.md#attributes) in the README. Invalid attribute names, string event handlers (`onclick="…"`) and `javascript:` URLs are left out, and an invalid tag name fails the render.
- A signal passed as a child renders nothing while it holds `null`, `undefined`, `true` or `false`, like the same value written in JSX.
- Hydration keeps the attributes the server sent, and warns in development if the component renders others.
- An update to `class` or `style` changes only the class names and style properties the component renders. What a browser extension or a script added stays.

**Signals**

- Event listeners (`on-*`) run in a batch: the DOM updates and effects run when the listener returns, not after each `set()`. A listener that reads the updated DOM right after a `set()` has to do that in an `$effect`.
- On the server, a `$computed` signal runs its function each time it's read. Keep that function free of side effects.

### Added

**Vite**

- `@huuma/ui/vite`: the `huuma()` plugin, with a dev server that renders pages, serves islands and runs remote functions.
- Hot updates: an edited island updates in place and keeps its state, as long as its hooks don't change.
- `vite build` builds the browser scripts into `dist/client/` and the app into `dist/server/app.js`, a standard `fetch` handler. `dist/server/server.js` starts it on Node.
- Vite's `base` is supported, also as a URL for a CDN.
- An `adapter` option for other platforms, with `node()` as the default. The adapter API is experimental.
- The server entry's named exports are exports of the built app too, e.g. a Durable Object class.
- Standard decorators are compiled with Babel in the modules that use them.

**Server**

- `requestContext()` from `@huuma/ui/server` gives remote functions, pages, layouts, middleware and the code they call the current request, with `params`, `auth`, `env`, `connection` and `waitUntil()`.
- The `Env` interface types platform bindings once, for `requestContext().env` and `ctx.env`.
- `*.server.*` modules can't be imported from browser code.
- Remote modules may export their functions in more ways: `export const f = async () => {}`, `export { f }`, re-exports and a default export.
- The server renders the `value` of a `<select>` and a `<textarea>`, so the page shows it before hydration.

**Signals and JSX**

- `batch()` from `@huuma/ui/signal` holds updates back until its callback returns.
- `@huuma/ui/jsx-dev-runtime`, and `createElement` from `@huuma/ui`.

**Linting**

- `@huuma/ui/lint` works with Oxlint and ESLint as well as `deno lint`.
- A new rule, `huuma/no-request-context-in-islands`.

### Fixed

**Signals**

- A computed signal or an effect tracks the signals it reads in each run, so one read only in a branch taken later is tracked too.
- Subscribers run once per change, with settled computed values, and in the order they were created.
- A component's `$computed` signals stop when the component is removed.
- Destroy hooks run once an update completes, and a failed update keeps the cleanup of the components it would have removed.
- A `$computed` signal no longer stays subscribed after a server render. A signal shared between requests kept one from every render.

**Hydration**

- Nested islands and their children are preserved, and islands that follow them still hydrate.
- Empty text, and text next to other text, hydrate without taking the next node.
- Text bound to a signal stays bound after hydration.
- An island that renders nothing keeps its place.
- Raw HTML and edits to form fields survive hydration.

**Updates in the browser**

- A `<select>` shows its `value` when the browser creates it, and when its options change later.
- `dangerouslySetInnerHTML` with an empty string clears the HTML.
- The children of an SVG `<foreignObject>` are HTML elements.
- Numeric attributes update, and `value={false}` clears an input.
- An object is never written as the attribute value `"[object Object]"`.

**Server**

- `<script>` and `<style>` content, attributes from untrusted data and tag names are rendered safely.
- A generated CSP nonce stays local to its request.
- Layouts and middlewares apply only to pages in their own directory and below. `/admin`'s also applied to `/administrator`.
- The root page is found when the routes path has capital letters, and `node_modules` and hidden directories aren't searched for pages.

**Documentation**

- The i18n middleware belongs in `app/middleware.ts`. The README registered it for the whole app, which failed.

### Known limitations

- CSS imported by islands or pages isn't handled yet. Put stylesheets in `public/` or add them with `app.addStylesheet()`.
