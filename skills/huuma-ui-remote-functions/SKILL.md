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
- A function that returns `void` / `undefined` resolves to `undefined` on the client (the server responds `204 No Content`). This is the correct way to express "fire and forget" or "acknowledged mutation" — do **not** return `undefined` accidentally.
- A function that throws, or that returns a value JSON cannot represent (see below), rejects the client-side promise with a reconstructed `Error` carrying `name` and `message` from the server. Wrap calls in `try/catch`.

## Return value rules

The server (`packRemoteFunctions` in `src/platform/server/pack/pack.ts`) normalizes the return before sending:

| Return value                                              | Server response                          | Client receives        |
| --------------------------------------------------------- | ---------------------------------------- | ---------------------- |
| `undefined` (or `void`)                                   | `204 No Content`                         | `undefined`            |
| `null`                                                    | `200` body `null`                        | `null`                 |
| Any JSON-serializable value                               | `200` body `JSON.stringify(res)`         | the deserialized value |
| `function`, `Symbol`, Symbol-keyed-only object            | `500` `RemoteFunctionSerializationError` | rejected `Error`       |
| `BigInt`, circular reference (throws in `JSON.stringify`) | `500` `RemoteFunctionSerializationError` | rejected `Error`       |

The void/null distinction is preserved end-to-end: `void` → `undefined`, explicit `null` → `null`.

## Error handling and wire format

Current behavior (the success path is raw JSON; the error path uses HTTP status + a small JSON body):

- **Success** (`2xx`): the client stub parses the body as JSON and resolves. The success body shape is **not** enveloped — `JSON.stringify(res)` is sent directly. Backward compatible.
- **`204`**: the client stub resolves `undefined` without parsing.
- **Non-`2xx`** (including `500` from a thrown remote function or an unserializable return): the client stub reads the JSON body and throws a reconstructed `Error` with:
  - `err.name` ← `body.name` (e.g. `"RemoteFunctionSerializationError"`), falling back to `"RemoteFunctionError"`.
  - `err.message` ← `body.message`, falling back to `"Remote function \"<name>\" failed (HTTP <status>)"`.
  - If the error body is not JSON (proxy `502`, HTML error page), the fallback message still carries the status code.
- **Important asymmetry — `name` only survives for serialization errors.** The only server path that emits a `name` field is the unserializable-return `500` produced inside `executeRemoteFunction`. Every other error — a user-thrown error inside the remote function, `NotFoundException` (function not found), and `@huuma/validate` body-schema failures — propagates to the framework's global `handleException` (`@huuma/route`), which emits `{ status, message, error? }` with **no `name`**. So for all real application errors the client's `err.name` falls back to the generic `"RemoteFunctionError"`; only `err.message` carries useful information. Closing this gap (wrapping user-thrown errors with a structured `{ name, message, ... }` body before they reach `handleException`) is the first Round 1 work item.
- **Network failures** (fetch rejects): currently surface as `TypeError: Failed to fetch` and are **not** wrapped into a `RemoteFunctionError` yet. This is a known gap.

The error body today carries only `{ name, message }`. Fields like `stack`, `cause`, `code`, or validation `fields` are **not** yet transported. Treat the body shape as provisional.

## Server-side validation

- The framework validates the request body with `@huuma/validate` inside the remote-handler shipped by `@huuma/ui/server/pack`.
- Schema: `{ remoteFunction: string, args?: unknown[] }`.
- The server looks up `remoteFunction` on the imported module and invokes it with the args.
- If the body fails schema validation, `remoteFunctionsSchema.parse(body)` throws and is handled by the framework's global error handler — **not** yet by the structured error path above. The same applies to `NotFoundException` ("Remote function not found"). Both are open improvements; do not rely on a structured body for these yet.
- Validate **business** input inside the remote function itself and throw a descriptive `Error` — its `name` and `message` will reach the client.

## Secrets and side effects

- Remote functions run on the server. Database access, secrets, and private APIs belong here.
- Do not put secrets in client code; only `PUBLIC_` env vars are shimmed to the client.

## Known limitations

- **`name` asymmetry**: the only server path that emits a `name` field is the unserializable-return `500` from `executeRemoteFunction`. Every other error (user-thrown, `NotFoundException`, `@huuma/validate` schema failure) goes through the framework's global `handleException` in `@huuma/route`, which emits `{ status, message, error? }` with no `name`. So all real application errors collapse to the generic `"RemoteFunctionError"` on the client; only `message` survives. Wrapping user-thrown errors with `{ name, message, ... }` is the first Round 1 work item.
- The client stub does not yet wrap network-level fetch failures (`TypeError: Failed to fetch`) into `RemoteFunctionError`; callers see the raw browser error.
- The error body carries only `name` and `message` (and only `name` on the serialization-error path). `stack`, `cause`, custom subclass properties, and validation `fields` are not yet transported. Dev/prod redaction policy for `stack` is not yet defined.
- Errors are rehydrated on the client as a plain `Error` with `name`/`message` set — there is no `instanceof`-checkable `RemoteFunctionError` class exported from `@huuma/ui` yet.
- Remote export detection in the bundler is regex-based; see `improvements.md`.

## Things to check

- Every remote function is `export async function`.
- Only JSON-serializable arguments are passed.
- Return values are JSON-serializable, or `void`/`undefined` intentionally. Watch for accidental `BigInt`, `function`, `Symbol`, or circular references — they produce a `500 RemoteFunctionSerializationError`.
- The `.remote.ts` file is imported only from islands (or server-safe code), not from server components that will ship to the client.
- Client call sites have a `try/catch` that handles the reconstructed `Error` (use `error.name` to distinguish `RemoteFunctionSerializationError` from your own thrown errors).
- If you rely on the void/null distinction, confirm the client code expects `undefined` for `void` returns, not `null`.
