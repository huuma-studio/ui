# Huuma UI

[![JSR Score](https://jsr.io/badges/@huuma/ui/score)](https://jsr.io/@huuma/ui) [![JSR Version](https://jsr.io/badges/@huuma/ui)](https://jsr.io/@huuma/ui)

Huuma UI is a lightweight, modern UI framework for Deno that enables building interactive web applications with a component-based architecture. It provides server-side rendering with client-side hydration for optimized performance and SEO.

## Features

- **JSX Support**: Create component-based UIs with familiar JSX syntax
- **Server-Side Rendering**: Render components on the server for improved SEO and initial load performance
- **Islands Architecture**: Selectively hydrate components on the client for interactivity
- **Signal-Based Reactivity**: Fine-grained reactivity system for efficient updates
- **Internationalization (i18n)**: Built-in support for multilingual applications
- **TypeScript First**: Fully typed API for improved developer experience
- **Zero Dependencies**: Lightweight and optimized for Deno's runtime
- **Live Module Reloading**: Fast development cycle with live reloading

## Quick Start

### 1. Create a New Project with Huuma CLI

```bash
# Install Huuma CLI if you haven't already
deno install -A -f -g -r -n huuma jsr:@huuma/cli

# Create a new project
huuma project

# Enter your project name when prompted
# Select "website" as the project type
```

This will create a project with the following structure:
```
your-project-name/
├── assets/            # Static assets
├── pages/             # Page components
│   ├── page.tsx       # Main page component
│   └── root.tsx       # Root layout component
├── src/               # Application source code
├── app.ts             # Production entry point
├── dev.ts             # Development entry point
└── deno.json          # Deno configuration
```

### 2. Run Your Project

```bash
cd your-project-name

# Start the development server
deno task dev
```

The default page.tsx will look something like:

```tsx
// pages/page.tsx
export default function HomePage() {
  return (
    <>
      <main>
        <h2>Hello Huuma</h2>
      </main>
    </>
  );
}
```

### 3. Add Interactivity with Islands

```tsx
// pages/Counter$.tsx (the $ suffix marks this as an island component)
import { $signal } from "@huuma/ui/hooks/signal";

export default function Counter() {
  const count = $signal(0);

  return (
    <div>
      <p>Count: {count.get()}</p>
      <button on-click={() => count.set(count.get() + 1)}>Increment</button>
    </div>
  );
}
```

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
import { $mount, $unmount } from "@huuma/ui/hooks/lifecycle";

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
        submit: "Submit"
      }
    },
    de: {
      greeting: "Hallo, {{name}}!",
      buttons: {
        submit: "Absenden"
      }
    }
  }
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
// pages/blog/layout.tsx
export default function BlogLayout({ children }) {
  return (
    <div className="blog-layout">
      <aside>Blog Sidebar</aside>
      <section>{children}</section>
    </div>
  );
}

// pages/blog/page.tsx
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

## Project Structure

A typical Huuma UI project structure:

```
my-app/
├── assets/           # Static assets
├── pages/            # Page components
│   ├── layout.tsx    # Layout components
│   ├── page.tsx      # Page components
│   └── Counter$.tsx  # Island components (with $ suffix)
├── src/              # Application code
├── app.ts            # Main application entry
└── deno.json         # Deno configuration
```

## Development Workflow

Once you've created your project with Huuma CLI, you can use the following commands:

1. **Development Mode** - Start the development server with hot reloading

```bash
deno task dev
```

2. **Production Bundle** - Bundle your application for production

```bash
deno task bundle
```

3. **Production Start** - Start the production server

```bash
deno task start
```

## Browser Support

Huuma UI targets modern browsers with good ES module support:

- Chrome/Edge 79+
- Firefox 67+
- Safari/iOS Safari 11.1+

## License

MIT

---

Built with ❤️ by the Huuma team
