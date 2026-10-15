// Builds copies of the basic fixture and starts them like in production, for
// the build tests and the browser tests.
import { createBuilder, type InlineConfig } from "vite";
import { type ChildProcess, spawn } from "node:child_process";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { huuma } from "../src/vite/mod.ts";

export const fixtures: string = fileURLToPath(new URL("fixtures", import.meta.url));

/** A port that's free right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/** Builds a copy of the basic fixture with `vite build`'s builder. */
export async function buildFixture(prefix: string, config: InlineConfig = {}): Promise<string> {
  const root = await mkdtemp(join(fixtures, prefix));
  await cp(join(fixtures, "basic"), root, { recursive: true });
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [huuma()],
    ...config,
  });
  await builder.buildApp();
  return root;
}

/** Starts `dist/server/server.js` like in production; resolves with its origin. */
export async function startServer(root: string): Promise<{ origin: string; server: ChildProcess }> {
  const port = await freePort();
  const server = spawn(process.execPath, [join(root, "dist/server/server.js")], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Route logs once the server is listening.
  await started(server, "server.js", "Listening on");
  return { origin: `http://127.0.0.1:${port}`, server };
}

/**
 * Runs the build in Cloudflare's workerd with `wrangler dev`, from a
 * `wrangler.jsonc` with `config` that serves `dist/client` as static
 * assets. Resolves with its origin.
 */
export async function startWorker(
  root: string,
  config: Record<string, unknown>,
): Promise<{ origin: string; server: ChildProcess }> {
  await writeFile(
    join(root, "wrangler.jsonc"),
    JSON.stringify({ name: "huuma-fixture", compatibility_date: "2026-10-01", ...config }),
  );
  const [port, inspectorPort] = [await freePort(), await freePort()];
  // The CLI, which wrangler's package exports don't include.
  const wrangler = join(
    dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
    "bin/wrangler.js",
  );
  const args = ["dev", "--ip", "127.0.0.1", "--port", String(port)];
  const server = spawn(
    process.execPath,
    [wrangler, ...args, "--inspector-port", String(inspectorPort)],
    {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: root },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await started(server, "wrangler dev", "Ready on");
  return { origin: `http://127.0.0.1:${port}`, server };
}

// Resolves once `server` printed `ready`; rejects if it exits first.
function started(server: ChildProcess, name: string, ready: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    const read = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(ready)) resolve();
    };
    server.stdout!.on("data", read);
    server.stderr!.on("data", read);
    server.once("exit", (code) => reject(new Error(`${name} exited (${code}): ${output}`)));
  });
}
