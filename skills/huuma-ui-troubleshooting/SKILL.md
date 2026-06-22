---
name: huuma-ui-troubleshooting
description: Diagnosing and fixing Huuma UI lint violations and runtime errors after they occur.
---

# Huuma UI Troubleshooting

Use this skill when the agent (or user) hits a Huuma UI lint violation or runtime error. Map the symptom to the boundary rule it enforces, then apply the corrective edit.

## Symptom → cause → fix

### "remote function MUST be an async function export"

- **Rule:** `.remote.ts` exports must be `export async function name(...)` (lint `async-remote-functions`, enforced by `jsr:@huuma/ui/lint`).
- **Fix:** Convert `export const foo = async () => {}` or `export function foo()` to `export async function foo(...)`.
- **How to verify:** run `deno lint` in your project (with the `jsr:@huuma/ui/lint` plugin configured in `deno.json`).

### "hooks not allowed in async components" / "No sync vnode scope found"

- **Rule:** `$`-hooks (`$signal`, `$effect`, `$mount`, `$ref`, `$url`, `$route`, `$t`, etc.) run only in sync island scope.
- **Fix:** Move the hook call out of the `async` function or before any `await`. Use a wrapper sync component and call the hook at the top level. For async data, use `resolver()` (from `@huuma/ui/hooks/scope`) in the server component and pass the result down as props.
- **How to verify:** `deno lint` (lint `no-async-hook-calling`, via `jsr:@huuma/ui/lint`); the hook scope is provided by `@huuma/ui/hooks/scope`.

### "client-side does not support async jsx"

- **Rule:** `.client.tsx` default export must not be `async` (lint `no-async-client-jsx`, enforced by `jsr:@huuma/ui/lint`).
- **Fix:** Make the island default export a sync component. Fetch/await data elsewhere (e.g. in a parent server component or via remote function).
- **How to verify:** `deno lint`.

### Event handler not firing in an island

- **Rule:** Only kebab-cased `on-[a-z]+` event names are recognized (behavior of `@huuma/ui/jsx-runtime`).
- **Fix:** Replace `onClick={...}` / `onSubmit={...}` with `on-click={...}` / `on-submit={...}`.
- **How to verify:** `deno doc jsr:@huuma/ui/jsx-runtime` for the recognized event props.

### Island never hydrates

- **Rule:** `root.tsx` must render `<Scripts>` and `<Launch>` (from `@huuma/ui/server`).
- **Fix:** Add `<Scripts />` and `<Launch />` to the body in `root.tsx`.
- **How to verify:** the README "Server Setup with Layouts" section shows the required shell.

### Remote function call rejects with a reconstructed `Error`

- **Cause:** The server returned a non-`2xx` response. The client stub checks `res.ok` and throws an `Error` with `name`/`message` reconstructed from the server's JSON error body. Common sources: the remote function threw, the return value was not JSON-serializable (`BigInt`, `function`, `Symbol`, circular reference → `500` with `name: "RemoteFunctionSerializationError"`), the function name was not found (`NotFoundException`), or the request body failed `@huuma/validate` schema validation.
- **Fix:** Wrap calls in `try/catch`. Read `error.message` for the human-readable cause. Read `error.name` to spot `"RemoteFunctionSerializationError"` (a programmer error — fix the return value). Note: errors thrown inside the remote function currently arrive as `name: "RemoteFunctionError"` (the fallback), not the original thrown class name, because the framework's global `handleException` emits `{ status, message, error? }` with no `name`. See `huuma-ui-remote-functions` for the full return-value and error table.
- **Note:** `NotFoundException` and `@huuma/validate` schema failures also go through `handleException` and arrive as `"RemoteFunctionError"` on the client.

### Remote function resolves to `undefined` unexpectedly

- **Cause:** The remote function returned `void` / `undefined`. The server responds `204 No Content` and the client stub resolves `undefined` (not `null`). This is intentional behavior, not a parse error.
- **Fix:** If the client expects a value, return `null` or a concrete object from the remote function. Do not rely on `undefined` to mean "no result" if the client treats `null` and `undefined` differently.

### TypeError: `.get` is not a function on a ref, or signal accessed without parentheses

- **Rule:** Signals use `.get()` methods; refs use `.get` property accessors. Signals come from `@huuma/ui/hooks/signal` / `@huuma/ui/signal`; refs from `@huuma/ui/hooks/ref` / `@huuma/ui/ref`.
- **Fix:** Use `signal.get()` and `ref.get` consistently.

### "No server code is allowed to be imported on the client side"

- **Rule:** `.server.ts`/`.server.tsx` files cannot be imported into client bundles.
- **Fix:** Move shared logic into a non-`.server` file, or keep the import server-only.

## General debugging steps

1. Run `deno lint` in your project and read the exact rule name reported by the `jsr:@huuma/ui/lint` plugin.
2. Inspect the relevant public API with `deno doc jsr:@huuma/ui/<subpath>` (e.g. `deno doc jsr:@huuma/ui/hooks/scope`) or "Go to Definition" in your editor.
3. Verify which of the four boundary rules is violated (see `huuma-ui-foundation`).
4. Apply the minimal fix that moves the code to the correct boundary (server component, island, or remote function).
