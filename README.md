# Huuma UI

[![JSR Score](https://jsr.io/badges/@huuma/ui/score)](https://jsr.io/@huuma/ui) [![JSR Version](https://jsr.io/badges/@huuma/ui)](https://jsr.io/@huuma/ui)

> ⚠️ **Developer Preview** - Huuma UI is currently in active development and should be considered experimental software. This release contains known bugs, incomplete features, and APIs that will change without notice. Documentation may be outdated or incorrect. Performance has not been optimized and memory leaks may occur. **Do not use in production environments.** We encourage experimentation and feedback, but please expect breaking changes, data loss, and unstable behavior. Use at your own risk.

Huuma UI is a web framework for interactive websites: components render on the server, and islands come alive in the browser. It builds with [Vite 8](https://vite.dev) and runs on Node.js; Deno works too. Features remote server functions, reactive state management, and automatic code splitting.

> Huuma UI 0.3, the Vite version described here, isn't released yet: it's in development on the `next` branch. 0.2 is the Deno version, which [Huuma CLI](https://jsr.io/@huuma/cli) creates projects for.

## Features

- **JSX Support**: Create component-based UIs with familiar JSX syntax
- **Server-Side Rendering**: Render async components on the server for improved SEO and initial load performance
- **Islands Interactivity**: Selectively hydrate components on the client for interactivity
- **Remote Server Functions**: Type-safe server-side functions for handling form submissions and data mutations
- **Signal-Based Reactivity**: Fine-grained reactivity system for efficient updates
- **Internationalization (i18n)**: Built-in support for multilingual applications
- **TypeScript First**: Fully typed API for improved developer experience
- **Hot Updates**: Edited islands update in place and keep their state, with Vite's dev server

## Installation

Huuma UI is published on [JSR](https://jsr.io/@huuma/ui). It needs Node.js 24 or later (the router of [`@huuma/route`](https://jsr.io/@huuma/route) uses the global `URLPattern`) and Vite 8.

With pnpm 10.9+ (recommended) or Yarn 4.9+, which install JSR packages natively:

```sh
pnpm add jsr:@huuma/ui
pnpm add -D vite@^8
```

With npm or Bun, through JSR's npm compatibility layer (`jsr add` also writes an `.npmrc` for it):

```sh
npx jsr add @huuma/ui
npm install -D vite@^8
```

pnpm is recommended: npm and Yarn can install a package twice through the compatibility layer. Add `@huuma/route` the same way if your app imports it, e.g. for middlewares. For Deno, see [Deno](#deno).

## Quick Start

`package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "node dist/server/server.js"
  }
}
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { huuma } from "@huuma/ui/vite";

export default defineConfig({ plugins: [huuma()] });
```

```ts
// server.ts: the app, as the default export
import { createUIApp } from "@huuma/ui/server";
import Root from "./app/root.tsx";

export default createUIApp(Root);
```

```tsx
// app/root.tsx: the HTML document around every page
import { Launch, type RootPageProps, Scripts } from "@huuma/ui/server";

export default function Root({ children, scripts, islands, transferState }: RootPageProps<unknown>) {
  return (
    <html lang="en">
      <head>
        <Scripts scripts={scripts?.head} nonce={scripts?.nonce} />
      </head>
      <body>
        {children}
        <Launch body={scripts?.body} islands={islands} transferState={transferState} nonce={scripts?.nonce} />
      </body>
    </html>
  );
}
```

```tsx
// app/page.tsx: the page at /
import Counter from "./counter.client.tsx";

export default function HomePage() {
  return (
    <main>
      <h2>Hello Huuma</h2>
      <Counter />
    </main>
  );
}
```

```tsx
// app/counter.client.tsx: an island (the .client.tsx suffix), interactive in the browser
import { $signal } from "@huuma/ui/hooks/signal";

export default function Counter() {
  const count = $signal(0);
  return <button on-click={() => count.set(count.get() + 1)}>Count: {count}</button>;
}
```

Start the dev server with `pnpm dev` (or `vp dev` with [Vite+](https://viteplus.dev)) and open the URL it prints. For type checking and your editor, set `"jsx": "react-jsx"` and `"jsxImportSource": "@huuma/ui"` in `tsconfig.json`; Vite compiles JSX for Huuma either way.

## Project Structure

```
my-app/
├── app/                    # Pages, layouts and middlewares
│   ├── root.tsx            # The HTML document
│   ├── layout.tsx          # A layout around the pages below it
│   ├── middleware.ts       # Middlewares for the pages below it
│   ├── page.tsx            # The page at /
│   ├── about/page.tsx      # The page at /about
│   ├── !404/page.tsx       # The page for paths that aren't found
│   └── counter.client.tsx  # An island
├── src/                    # Application code
│   ├── user.remote.ts      # Remote server functions
│   └── db.server.ts        # Server-only code
├── public/                 # Static files, served as they are
├── server.ts               # The app
├── vite.config.ts
└── package.json
```

Pages, layouts and middlewares go in `app/`, islands anywhere in the project as `*.client.tsx`, remote functions as `*.remote.ts`, server-only modules as `*.server.*`.

## Dev Server

The dev server discovers your pages, layouts, middlewares and islands, renders pages on the server and serves islands to the browser. Edits to server code rebuild the app and reload the page.

- **Remote functions:** browser code gets a stub that calls the server, never the module's code or imports. Every value export of a remote module is a remote function: `export async function`, `export const f = async () => {}` (also with several declarators or a type annotation), `export { f }`, `export { f } from "./f.ts"` and the default export. `export *`, destructuring, classes and enums fail with an error at the export.
- **Server-only code:** importing a `*.server.*` module (any extension) from browser code fails, naming the importer. Use it from server code, e.g. a remote function.
- **Environment variables:** `PUBLIC_*` variables (from the environment and `.env` files) are available as `import.meta.env.PUBLIC_*`, in the browser and on the server. Other variables stay on the server. `Deno.env.get()` still works for one more minor version, with a deprecation warning. Declare your variables' types yourself, e.g. with `/// <reference types="vite/client" />` and an `ImportMetaEnv` interface.
- **Decorators:** standard decorators, e.g. `@inject()` from `@huuma/inject`, are compiled with Babel in the modules that use them. Install it in your app: `pnpm add -D @babel/core @babel/plugin-proposal-decorators`.
- **Updates:** an edited island updates in place, without reloading the page, and keeps its state: signals keep their values, and typed input and focus stay. If you add, remove or reorder hooks (`$signal`, `$computed`, …) or change their arguments, the island starts over with its initial state. Components defined in the island's module next to it start over too. Other edits, e.g. to pages, layouts or an island's helper modules, reload the page.

Options of `huuma()`:

- `routes`: the directory with `page.tsx`, `layout.tsx` and `middleware.ts` files. Defaults to `"app"`.
- `server`: the module that exports the app. Defaults to `"server.ts"`.
- `decorators`: `"auto"` (default) compiles standard decorators unless Oxc's legacy decorators (`oxc.decorator.legacy`) are on; `true` or `false` to force it. Huuma supports standard decorators. If your app uses legacy (TypeScript `experimentalDecorators`) decorators, set `oxc: { decorator: { legacy: true } }` in your Vite config: `experimentalDecorators` in `tsconfig.json` alone isn't picked up, and Babel would compile them as standard decorators.

## Production Build

`vite build` (or `vp build`) builds the browser scripts and the app:

- `dist/client/`: the browser runtime, the islands and the code they share, with hashed file names in `assets/`, plus Vite's `public/` directory.
- `dist/server/app.js`: the app, as the default export, with a standard `fetch(request)` handler: it renders pages and runs remote functions. It doesn't serve `dist/client/` and doesn't strip the `base` (see below); `server.js` does both. To run `app.js` on another runtime's server, e.g. `deno serve` or Bun, serve the files in `dist/client/` there too, below the base, and strip a base other than `/` before the app gets a request.
- `dist/server/server.js`: starts the app on Node with `@huuma/route/node` and serves `dist/client/`: files named with their content hash (Vite names them so by default) are cached for good; other files, like those from `public/`, for an hour.

```sh
HUUMA_ENV=PROD PORT=3000 node dist/server/server.js
```

`PORT` (default `8000`) and `HOST` (default: all interfaces) set where it listens; `HUUMA_ENV=PROD` is `@huuma/route`'s production mode. Set `build.outDir` to build somewhere else than `dist/`.

With a [`base`](https://vite.dev/config/shared-options.html#base) other than `/`, e.g. `/shop/`, the app lives below it, in the dev server and with `server.js` alike: `/shop/about` renders the page `app/about/page.tsx`, `/` redirects to `/shop/`, and other paths outside of it are not found. Remote functions are called below the base too. Links in your pages need the base themselves, e.g. from `import.meta.env.BASE_URL`. With a URL as the base, e.g. `https://cdn.example/shop/` for a CDN, built pages load their scripts from that URL, while the app lives below its path, `/shop/`, and remote functions are called there.

Not there yet: CSS imported by islands or pages. Put stylesheets in `public/` and link them in `root.tsx`, or add them with `app.addStylesheet()`.

## Linting

`@huuma/ui/lint` checks remote functions, hooks and islands: remote modules export async functions only, async components don't call hooks (`$signal`, …), and islands aren't async. It works with Oxlint, ESLint and `deno lint`.

For Oxlint, in `.oxlintrc.json`:

```json
{
  "jsPlugins": ["@huuma/ui/lint"],
  "rules": {
    "huuma/async-remote-functions": "error",
    "huuma/no-async-hook-calling": "error",
    "huuma/no-async-client-jsx": "error"
  }
}
```

For ESLint, in `eslint.config.js`, with typescript-eslint's parser for TypeScript files:

```js
import tseslint from "typescript-eslint";
import huuma from "@huuma/ui/lint";

export default [
  { files: ["**/*.ts", "**/*.tsx"], languageOptions: { parser: tseslint.parser } },
  huuma.configs.recommended,
];
```

## Deno

Deno runs Vite and the built app too. Deno support is best effort: CI checks it, but Node.js is the supported runtime. Keep the `package.json` from the [Quick Start](#quick-start), install the dependencies (e.g. with pnpm), and run Vite and `server.js` with Deno:

```sh
deno run -A npm:vite          # dev server
deno run -A npm:vite build    # production build
deno run -A dist/server/server.js
```

With a `package.json`, Deno takes the packages from `node_modules`, like Node.js.

## Remote server functions

Remote server functions provide a type-safe way to handle form submissions and server-side data mutations. They run exclusively on the server and can be called from both server and client components. Remote server functions are defined in files with the `.remote.ts` suffix and must be exported async functions. Remote server functions only accept JSON-conform data as function input.

### Basic Remote server functions

```tsx
// src/user.remote.ts
export async function createUser(data: { name: string; email: string }) {
  const { name, email } = data;

  // Validate input
  if (!name || !email) {
    throw new Error("Name and email are required");
  }

  // Save to database
  const user = await db.users.create({ name, email });

  return { success: true, user };
}
```

### Using Remote server functions in Forms

```tsx
// app/create-user.client.tsx
import { createUser } from "../src/user.remote.ts";
import { $signal } from "@huuma/ui/hooks/signal";

export default function CreateUserForm() {
  const pending = $signal(false);
  const message = $signal("");

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    pending.set(true);

    try {
      const formData = new FormData(event.target as HTMLFormElement);
      const data = {
        name: formData.get("name") as string,
        email: formData.get("email") as string,
      };
      const result = await createUser(data);
      message.set(`User ${result.user.name} created successfully!`);
    } catch (error) {
      message.set(`Error: ${error.message}`);
    } finally {
      pending.set(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Name:</label>
        <input type="text" id="name" name="name" required />
      </div>
      <div>
        <label htmlFor="email">Email:</label>
        <input type="email" id="email" name="email" required />
      </div>
      <button type="submit" disabled={pending.get()}>
        {pending.get() ? "Creating..." : "Create User"}
      </button>
      {message.get() && <p>{message.get()}</p>}
    </form>
  );
}
```

### Return values and error handling

Remote function return values are normalized before being sent to the client:

- A `void` / `undefined` return produces a `204 No Content` response and resolves to `undefined` on the client. The void/null distinction is preserved — an explicit `null` return resolves to `null`.
- Any JSON-serializable value is sent as a `200` with the JSON body.
- A return value that JSON cannot represent (`function`, `Symbol`, `BigInt`, or a circular reference) produces a `500` with an error body of `{ name: "RemoteFunctionSerializationError", message: "..." }`.

On the client, the generated stub checks the HTTP status:

- `2xx` resolves with the deserialized JSON body.
- `204` resolves `undefined`.
- Non-`2xx` responses reject the promise with a reconstructed `Error` whose `name` and `message` come from the server's JSON error body (falling back to `"Remote function \"<name>\" failed (HTTP <status>)"` if the body is not JSON). Inspect `error.name` to distinguish `RemoteFunctionSerializationError` (a programmer error in the return value) from errors thrown by the remote function itself.

```tsx
const handleSubmit = async (event: Event) => {
  event.preventDefault();
  try {
    const result = await createUser(data);
    // result is the deserialized JSON return value, or undefined for void returns
  } catch (error) {
    // error.name may be "RemoteFunctionSerializationError", the name of an
    // error thrown inside the remote function, or "RemoteFunctionError"
    // (fallback when the server's error body was not JSON).
    console.error(error.name, error.message);
  }
};
```

Note: request-body schema validation failures and unknown-function-name errors still go through the framework's global error handler and may not yet produce a structured `{ name, message }` body. Network-level fetch failures surface as `TypeError: Failed to fetch`.

## Signals and Reactivity

Huuma UI uses a signal-based reactivity system for efficient UI updates:

```tsx
import { $signal, $computed, $effect } from "@huuma/ui/hooks/signal";

function Counter() {
  // Create a writable signal
  const count = $signal(0);

  // Create a computed signal
  const doubleCount = $computed(() => count.get() * 2);

  // Create a side effect
  $effect(() => {
    console.log(`The count changed to: ${count.get()}`);
  });

  return (
    <div>
      <p>Count: {count.get()}</p>
      <p>Double: {doubleCount.get()}</p>
      <button on-click={() => count.set(count.get() + 1)}>Increment</button>
    </div>
  );
}
```

## Lifecycle Hooks

Control component lifecycle with hooks:

```tsx
import { $mount, $destroy } from "@huuma/ui/hooks/lifecycle";

function Timer() {
  const time = $signal(new Date());

  $mount(() => {
    const interval = setInterval(() => {
      time.set(new Date());
    }, 1000);

    return () => clearInterval(interval);
  });

  return <div>{time.get().toLocaleTimeString()}</div>;
}
```

## Internationalization (i18n)

Huuma UI provides built-in i18n support:

```tsx
// Configure i18n
import { setupI18n, T } from "@huuma/ui/i18n";
import { useI18n } from "@huuma/ui/i18n/middleware";

const i18nConfig = setupI18n(app, {
  defaultLanguage: "en",
  languages: {
    en: {
      greeting: "Hello, {{name}}!",
      buttons: {
        submit: "Submit",
      },
    },
    de: {
      greeting: "Hallo, {{name}}!",
      buttons: {
        submit: "Absenden",
      },
    },
  },
});

// Use translations in components
function Greeting() {
  return (
    <div>
      <T name="greeting" props={{ name: "World" }} />
      <button>
        <T name="buttons.submit" />
      </button>
    </div>
  );
}

// Add the i18n middleware
app.middleware(useI18n(i18nConfig));
```

## Server Setup with Layouts

Organize your application with nested layouts:

```tsx
import { createUIApp, Meta, Scripts, Launch } from "@huuma/ui/server";

const app = createUIApp(({ children, scripts, islands, transferState }) => {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Scripts scripts={scripts?.head} nonce={scripts?.nonce} />
        <title>My App</title>
      </head>
      <body>
        <header>Common Header</header>
        <main>{children}</main>
        <footer>Common Footer</footer>

        <Scripts scripts={scripts?.body} nonce={scripts?.nonce} />
        <Launch
          body={scripts?.body}
          nonce={scripts?.nonce}
          islands={islands}
          transferState={transferState}
        />
      </body>
    </html>
  );
});
```

## Advanced Topics

### Nested Layouts

```tsx
// app/blog/layout.tsx
export default function BlogLayout({ children }) {
  return (
    <div className="blog-layout">
      <aside>Blog Sidebar</aside>
      <section>{children}</section>
    </div>
  );
}

// app/blog/page.tsx
export default function BlogPage() {
  return <article>Blog Content</article>;
}
```

### URL/Route Access in Components

```tsx
import { $url } from "@huuma/ui/hooks/scope";

function NavigationLink({ href, children }) {
  const currentUrl = $url();
  const isActive = currentUrl.pathname.startsWith(href);

  return (
    <a href={href} className={isActive ? "active" : ""}>
      {children}
    </a>
  );
}
```

## Browser Support

The production build targets Vite's default, [Baseline Widely Available](https://vite.dev/config/build-options.html#build-target) browsers: Chrome/Edge 111+, Firefox 114+ and Safari 16.4+.

## License

MIT

---

Built with ❤️ by the Huuma team
