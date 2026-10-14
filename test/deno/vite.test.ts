// A Huuma app with Vite on Deno, which is best effort (spec #126, D4): Vite's
// CLI builds the basic fixture and serves it in dev, and the built
// `server.js` serves it like in production, all on Deno. Uses the repo's
// node_modules (`pnpm install` first), like an app with a package.json.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { renderFixture } from "../rendered.ts";
import { repoRoot } from "./config.ts";

const fixtures = join(repoRoot, "test/fixtures");
// Upstream Vite: `vite` itself is Vite+'s copy, which has no CLI.
const vite = join(repoRoot, "node_modules/vite-upstream/bin/vite.js");

/** `deno run` in `cwd`, with the repo's node_modules. */
function deno(cwd: string, args: string[], env: Record<string, string> = {}): Deno.Command {
  return new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "--no-check", "--node-modules-dir=manual", ...args],
    cwd,
    env,
    stdout: "piped",
    stderr: "piped",
  });
}

/**
 * Starts a server and resolves once it prints `ready`. Its output is read to
 * the end, so its pipes never fill up; `stop()` ends it.
 */
async function start(command: Deno.Command, ready: string): Promise<{ stop(): Promise<void> }> {
  const process = command.spawn();
  let output = "";
  let onReady!: () => void;
  const isReady = new Promise<void>((resolve) => (onReady = resolve));
  const read = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
      output += chunk;
      if (output.includes(ready)) onReady();
    }
  };
  const reading = Promise.all([read(process.stdout), read(process.stderr)]);
  const stop = async () => {
    try {
      process.kill();
    } catch {
      // Exited already.
    }
    await Promise.all([process.status, reading]);
  };
  const exited = process.status.then(() => false);
  if (!(await Promise.race([isReady.then(() => true), exited]))) {
    await stop();
    assert.fail(`"${ready}" never appeared:\n${output}`);
  }
  return { stop };
}

/** A port that's free right now. */
function freePort(): number {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
}

// What HTTP adds to the app's headers.
const TRANSPORT_HEADERS = [
  "connection",
  "content-length",
  "date",
  "keep-alive",
  "transfer-encoding",
];

/** Sends the requests `renderFixture()` makes to a server over HTTP. */
function over(origin: string) {
  return {
    async fetch(request: Request): Promise<Response> {
      const { pathname, search } = new URL(request.url);
      const response = await fetch(origin + pathname + search, request);
      const headers = new Headers(response.headers);
      for (const name of TRANSPORT_HEADERS) headers.delete(name);
      return new Response(response.body, { status: response.status, headers });
    },
  };
}

Deno.test("vite build on Deno, served by server.js on Deno", async () => {
  const root = await mkdtemp(join(fixtures, ".tmp-deno-build-"));
  try {
    await cp(join(fixtures, "basic"), root, { recursive: true });
    const build = await deno(root, [vite, "build"]).output();
    assert.equal(build.code, 0, new TextDecoder().decode(build.stderr));

    const port = freePort();
    const server = await start(
      deno(root, ["dist/server/server.js"], { PORT: String(port), HOST: "127.0.0.1" }),
      "Listening on",
    );
    try {
      assert.equal(
        await renderFixture(over(`http://127.0.0.1:${port}`)),
        await readFile(join(repoRoot, "test/snapshots/basic.txt"), "utf8"),
      );
    } finally {
      await server.stop();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

Deno.test("vite dev on Deno", async () => {
  const root = await mkdtemp(join(fixtures, ".tmp-deno-dev-"));
  try {
    await cp(join(fixtures, "basic"), root, { recursive: true });
    const port = freePort();
    const server = await start(
      deno(root, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"]),
      "ready in",
    );
    try {
      await checkDevServer(`http://127.0.0.1:${port}`);
    } finally {
      await server.stop();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** The dev server renders pages, serves island modules and remote functions. */
async function checkDevServer(origin: string) {
  const page = await fetch(`${origin}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("<h1>Home</h1>"), html);
  assert.ok(html.includes("<p>Hello Ada</p>"), html);

  const island = await fetch(`${origin}/app/counter.client.tsx`);
  assert.equal(island.status, 200);
  await island.body?.cancel();

  const sum = await fetch(`${origin}/_huuma/remote/bb2fb3f5/sum.remote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
  });
  assert.equal(await sum.json(), 3);
}
