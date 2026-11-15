---
name: huuma-ui-remote-functions
description: Adding server-side mutations and form handling to a Huuma UI app with type-safe .remote.ts functions.
---

# Huuma UI Remote Functions

Use this skill when the agent is adding server-side mutations, form submissions, or backend calls in a Huuma UI app.

## File convention

- Remote functions live in `.remote.ts` files.
- Every value export is a remote function and must be an async function (lint `async-remote-functions`): `export async function name(...)`, `export const name = async (...) => {}` (also with a type annotation or several declarators), `export { name }`, `export { name } from "./other.ts"`.
- Default exports are allowed and are treated as the `default` remote function.
- `export *`, destructuring (`export const { a } = …`), classes and enums fail the dev server and the build with an error at the export. Type exports are ignored.

## Calling from the client

- Import the `.remote.ts` file into an island (`.client.tsx`).
- Call the exported async function directly; in browser code, the Vite plugin replaces the module with a stub that `fetch`es `POST /_huuma/remote/<hash>/<module>` (below Vite's `base`). The module's code and imports never reach the browser.
- Arguments must be JSON-serializable.
- The return value is JSON-deserialized on the client.
- A function that returns `void` / `undefined` resolves to `undefined` on the client (the server responds `204 No Content`). This is the correct way to express "fire and forget" or "acknowledged mutation" — do **not** return `undefined` accidentally.
- A function that throws, or that returns a value JSON cannot represent (see below), rejects the client-side promise with an `Error`. Wrap calls in `try/catch`. Only an `HttpException` from `@huuma/route` sends its message to the client: a plain `Error` arrives as `"Internal Server Error"` (see [Error handling](#error-handling-and-wire-format)).

## Return value rules

The server normalizes the return before sending:

| Return value                                              | Server response                          | Client receives        |
| --------------------------------------------------------- | ---------------------------------------- | ---------------------- |
| `undefined` (or `void`)                                   | `204 No Content`                         | `undefined`            |
| `null`                                                    | `200` body `null`                        | `null`                 |
| Any JSON-serializable value                               | `200` body `JSON.stringify(res)`         | the deserialized value |
| `function`, `Symbol`, Symbol-keyed-only object            | `500` `RemoteFunctionSerializationError` | rejected `Error`       |
| `BigInt`, circular reference (throws in `JSON.stringify`) | `500` `RemoteFunctionSerializationError` | rejected `Error`       |

The void/null distinction is preserved end-to-end: `void` → `undefined`, explicit `null` → `null`.

## Error handling and wire format

The success path is raw JSON; the error path is an HTTP status and a small JSON body.

- **Success** (`2xx`): the client stub parses the body as JSON and resolves. `JSON.stringify(res)` is sent as is, without an envelope.
- **`204`**: the client stub resolves `undefined` without parsing.
- **Non-`2xx`**: the client stub reads the JSON body and throws an `Error` with:
  - `err.name` ← `body.name`, falling back to `"RemoteFunctionError"`.
  - `err.message` ← `body.message`, falling back to `"Remote function <name> failed (HTTP <status>)"`, e.g. for a proxy's `502` or an HTML error page.

What the client gets for each error on the server:

| On the server                                                                                    | Response                | `err.name`                           | `err.message`             |
| ------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------ | ------------------------- |
| A return value JSON cannot represent                                                             | `500`                   | `"RemoteFunctionSerializationError"` | what failed               |
| `throw new BadRequestException("Name taken")`, or another `HttpException` from `@huuma/route`    | its status, e.g. `400`  | `"RemoteFunctionError"`              | `"Name taken"`            |
| `throw new Error("Name taken")`, or any other error                                              | `500`                   | `"RemoteFunctionError"`              | `"Internal Server Error"` |

- A thrown error goes to the global error handler of `@huuma/route` (`handleException`), which logs it and answers `{ status, message }`. Only an `HttpException` keeps its status and message. Any other error's message stays on the server, so internal details never reach the browser.
- To tell the client what went wrong, throw an `HttpException`, e.g. `BadRequestException` from `@huuma/route/http/exception/bad-request-exception`. Add `@huuma/route` to the app's dependencies for it.
- **Network failures** (fetch rejects): surface as `TypeError: Failed to fetch`, not wrapped into a `RemoteFunctionError`.

## Server-side validation

- The route only accepts `content-type: application/json` (otherwise `415`) and refuses requests a browser marks `Sec-Fetch-Site: cross-site` (`403`), so other sites can't call remote functions with a visitor's cookies (CSRF). Scripts and tests calling an endpoint directly must send the JSON content type.
- The framework validates the request body with `@huuma/validate` in the route it registers for each remote module.
- Schema: `{ remoteFunction: string, args?: unknown[] }`.
- The server looks up `remoteFunction` on the imported module and invokes it with the args.
- A body that isn't JSON, or fails schema validation, gets `400`; an unknown function name gets `404` ("Remote function not found"). Both bodies are `{ status, message }` from the framework's global error handler, without a `name`, so the client sees `err.name === "RemoteFunctionError"`.
- Validate **business** input inside the remote function itself and throw a `BadRequestException` with a message for the user. A plain `Error` reaches the client as `500` `"Internal Server Error"`.

## The request: auth, headers, bindings

- Remote functions only get their arguments. Read the request with `requestContext()` from `@huuma/ui/server`: `request` (headers, cookies), `params`, `searchParams`, `auth`, `env`, `connection`, `waitUntil()`. It also works in `*.server.ts` helpers they call.
- **Auth checks:** remote endpoints run the app-wide middleware from `server.ts` (`app.use()`), not `app/**/middleware.ts`. Set `ctx.auth` there, and check `requestContext().auth` in the remote function; throw (e.g. `UnauthorizedException` from `@huuma/route/http/exception/unauthorized-exception`) when it's missing.
- **Bindings:** on Cloudflare Workers, `requestContext().env` holds KV, D1, R2, … typed through `declare module "@huuma/ui/server" { interface Env { … } }` (or `interface Env extends Cloudflare.Env {}` with `wrangler types`). On Node and Deno, and in `vite` dev, `env` is `{}`.
- **After the response:** `requestContext().waitUntil(promise)` keeps work running (`ctx.waitUntil()` on Workers); that work still has the request context.

## Secrets and side effects

- Remote functions run on the server. Database access, secrets, and private APIs belong here.
- Do not put secrets in client code; only `PUBLIC_` env vars reach the client (`import.meta.env.PUBLIC_*`). Keep server-only helpers in `*.server.*` modules: browser code can't import them.

## Known limitations

- **No `name` from thrown errors**: every thrown error reaches the client as `"RemoteFunctionError"`, and only an `HttpException` keeps its message. A custom error class's `name` can't be sent yet; only a return value JSON can't represent gets its own `name`.
- The client stub does not yet wrap network-level fetch failures (`TypeError: Failed to fetch`) into `RemoteFunctionError`; callers see the raw browser error.
- The client's `Error` gets only `name` and `message`. `stack`, `cause`, custom properties and an `HttpException`'s `error` field don't reach it.
- Errors are rehydrated on the client as a plain `Error` with `name`/`message` set — there is no `instanceof`-checkable `RemoteFunctionError` class exported from `@huuma/ui` yet.

## Things to check

- Every value export of a `.remote.ts` module is an async function.
- Remote functions that change data check `requestContext().auth`, set by an `app.use()` middleware in `server.ts`.
- Only JSON-serializable arguments are passed.
- Return values are JSON-serializable, or `void`/`undefined` intentionally. Watch for accidental `BigInt`, `function`, `Symbol`, or circular references — they produce a `500 RemoteFunctionSerializationError`.
- The `.remote.ts` file is imported only from islands (or server-safe code), not from server components that will ship to the client.
- Errors meant for the user are thrown as an `HttpException` (e.g. `BadRequestException`), not as a plain `Error`, which arrives as `"Internal Server Error"`.
- Client call sites have a `try/catch`. `error.name` tells a `RemoteFunctionSerializationError` from the rest; `error.message` holds an `HttpException`'s message.
- If you rely on the void/null distinction, confirm the client code expects `undefined` for `void` returns, not `null`.
