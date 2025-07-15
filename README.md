# Huuma UI

[![JSR Score](https://jsr.io/badges/@huuma/ui/score)](https://jsr.io/@huuma/ui) [![JSR Version](https://jsr.io/badges/@huuma/ui)](https://jsr.io/@huuma/ui)

> ⚠️ **Developer Preview** - Huuma UI is currently in active development and should be considered experimental software. This release contains known bugs, incomplete features, and APIs that will change without notice. Documentation may be outdated or incorrect. Performance has not been optimized and memory leaks may occur. **Do not use in production environments.** We encourage experimentation and feedback, but please expect breaking changes, data loss, and unstable behavior. Use at your own risk.

Huuma UI An easy to use web framework for Deno that lets you build interactive websites with components that work on both server and client. Features server actions, reactive state management, and automatic code splitting for optimal performance.

## Features

- **JSX Support**: Create component-based UIs with familiar JSX syntax
- **Server-Side Rendering**: Render async components on the server for improved SEO and initial load performance
- **Islands Interactivity**: Selectively hydrate components on the client for interactivity
- **Server Actions**: Type-safe server-side functions for handling form submissions and data mutations
- **Signal-Based Reactivity**: Fine-grained reactivity system for efficient updates
- **Internationalization (i18n)**: Built-in support for multilingual applications
- **TypeScript First**: Fully typed API for improved developer experience
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
// pages/counter.client.tsx (the .client.tsx suffix marks this as an island component)
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

## Server Actions

Server actions provide a type-safe way to handle form submissions and server-side data mutations. They run exclusively on the server and can be called from both server and client components. Server actions are defined in files with the `.actions.ts` suffix and must be exported async functions. Server actions only accept JSON-conform data as function input.

### Basic Server Action

```tsx
// src/user.actions.ts
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

### Using Server Actions in Forms

```tsx
// pages/create-user.client.tsx
import { createUser } from "../src/user.actions.ts";
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
│   └── counter.client.tsx  # Island components (with .client.tsx suffix)
├── src/              # Application code
│   ├── user.actions.ts    # Server actions for user operations
│   └── blog.actions.ts    # Server actions for blog operations
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
