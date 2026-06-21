---
name: huuma-ui-remote-functions
description: Adding server-side mutations and form handling to a Huuma UI app with type-safe .remote.ts functions.
---

# Huuma UI Remote Functions

Use this skill when the agent is adding server-side mutations, form submissions, or backend calls in a Huuma UI app.

## File convention

- Remote functions live in `.remote.ts` files.
- Each export must be `export async function name(...)` (lint `async-remote-functions`).
- Default exports are allowed and are treated as the `default` remote function.
- `export const foo = ...` and `export { foo }` are **not** reliably recognized by the current bundler stub; prefer named `export async function`.

## Calling from the client

- Import the `.remote.ts` file into an island (`.client.tsx`).
- Call the exported async function directly; the bundler replaces it with a `fetch` to `POST /_huuma/remote/<hash>/<name>`.
- Arguments must be JSON-serializable.
- The return value is JSON-deserialized on the client.

## Server-side validation

- The framework validates the request body with `@huuma/validate` inside the remote-handler shipped by `@huuma/ui/server/pack`.
- Schema: `{ remoteFunction: string, args?: unknown[] }`.
- The server looks up `remoteFunction` on the imported module and invokes it with the args.

## Secrets and side effects

- Remote functions run on the server. Database access, secrets, and private APIs belong here.
- Do not put secrets in client code; only `PUBLIC_` env vars are shimmed to the client.

## Known limitations of the generated stubs

- Stubs do not check `res.ok`; HTTP errors are passed to `res.json()` and surface as parse errors (see the README 'Remote server functions' section).
- Returning `undefined` from a remote function can produce an empty body, which `res.json()` cannot parse.
- Add server-side validation and client-side error handling around these cases.

## Things to check

- Every remote function is `export async function`.
- Only JSON-serializable arguments are passed.
- The `.remote.ts` file is imported only from islands (or server-safe code), not from server components that will ship to the client.
- Consider adding a `try/catch` on the client that handles non-OK responses.
