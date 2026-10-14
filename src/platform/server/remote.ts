import { posix } from "node:path";

import { generateHash, toCanonicalPath } from "./utils.ts";

// Remote functions: the endpoint a `*.remote.ts` module is served at, and
// the browser module that calls it. Shared by the Deno build pipeline
// (`pack/`) and the Vite plugin (`src/vite`); not an entry point in
// `jsr.json`'s exports map.

/**
 * The endpoint of a remote module, e.g.
 * `/_huuma/remote/1a2b3c4d/todo.remote` for `app/todo.remote.ts`. `path` is
 * relative to the project (the working directory under Deno, Vite's root
 * under Vite); the browser stub and the server route must agree on it.
 */
export async function remoteEndpoint(path: string): Promise<string> {
  const canonical = toCanonicalPath(path);
  return `/_huuma/remote/${await generateHash(canonical)}/${posix.parse(canonical).name}`;
}

/**
 * The browser module that replaces a remote module: each export becomes an
 * async function that calls the remote function by name. `"default"` is
 * the default export.
 *
 * The stub resolves to the function's JSON result, and to `undefined` for
 * `204 No Content`. A failed call rejects with an `Error` that has the
 * `name` and `message` of the server's error body, if it has one.
 */
export function remoteStub(endpoint: string, exports: string[]): string {
  const call = `async function $huuma$call(remoteFunction, args) {
  const res = await fetch(${JSON.stringify(endpoint)}, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ args, remoteFunction }),
  });
  if (res.status === 204) return undefined;
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = new Error(
      body?.message ??
        "Remote function " + remoteFunction + " failed (HTTP " + res.status + ")",
    );
    err.name = body?.name ?? "RemoteFunctionError";
    throw err;
  }
  return res.json();
}`;
  return [call, ...exports.map(stubExport)].join("\n") + "\n";
}

// A method keeps the export's name as the function's `name`, and works for
// every export name: `default`, keywords (`export { f as delete }`) and
// strings (`export { f as "a-b" }`).
function stubExport(name: string, index: number): string {
  const key = JSON.stringify(name);
  return [
    `const $huuma$${index} = {`,
    `  async [${key}](...args) { return $huuma$call(${key}, args); },`,
    `}[${key}];`,
    `export { $huuma$${index} as ${name === "default" ? "default" : key} };`,
  ].join("\n");
}
