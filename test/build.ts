// Builds copies of the basic fixture and starts them like in production, for
// the build tests and the browser tests.
import { createBuilder, type InlineConfig } from "vite";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

/**
 * A page at `/image` that imports an image, too large for Vite to inline
 * (4 kB), so the server build emits it as a file: for `buildFixture()`'s
 * `files`.
 */
export const IMAGE_PAGE: Record<string, string> = {
  "app/image/logo.svg": `<svg xmlns="http://www.w3.org/2000/svg"><!-- ${"x".repeat(5_000)} --></svg>\n`,
  "app/image/page.tsx": [
    'import logo from "./logo.svg";',
    "",
    "export default function Image() {",
    '  return <img src={logo} alt="" />;',
    "}",
    "",
  ].join("\n"),
};

/**
 * Builds a copy of the basic fixture with `vite build`'s builder, with
 * `files` added to it first (contents by path).
 */
export async function buildFixture(
  prefix: string,
  config: InlineConfig = {},
  files: Record<string, string> = {},
): Promise<string> {
  const root = await mkdtemp(join(fixtures, prefix));
  await cp(join(fixtures, "basic"), root, { recursive: true });
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
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
 * Runs the build in Cloudflare's workerd with `wrangler dev`, from the
 * `wrangler.json` the build wrote with @cloudflare/vite-plugin. Resolves
 * with its origin and a function that stops it.
 */
export async function startWorker(root: string): Promise<{ origin: string; stop: () => void }> {
  const [port, inspectorPort] = [await freePort(), await freePort()];
  // The CLI, which wrangler's package exports don't include.
  const wrangler = join(
    dirname(createRequire(import.meta.url).resolve("wrangler/package.json")),
    "bin/wrangler.js",
  );
  const server = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--config",
      "dist/server/wrangler.json",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      String(inspectorPort),
    ],
    {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: root },
      stdio: ["ignore", "pipe", "pipe"],
      // bin/wrangler.js starts the CLI as a child, which starts workerd:
      // killing only the first process leaves them running. On POSIX, its
      // own process group, to kill them all together. Windows has no
      // process groups, and a detached process would get its own console.
      detached: !windows,
      windowsHide: true,
    },
  );
  const stop = () => {
    if (windows) {
      // The process and its children (/T), or nothing if it already stopped.
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    try {
      process.kill(-server.pid!, "SIGKILL");
    } catch {
      // Already stopped.
    }
  };
  await started(server, "wrangler dev", "Ready on", stop);
  return { origin: `http://127.0.0.1:${port}`, stop };
}

const windows = process.platform === "win32";

// How long a server may take to start, below the tests' hook timeouts.
const START_TIMEOUT = 40_000;

// Resolves once `server` printed `ready`. Rejects if it exits first, or
// stops it and rejects if it doesn't start in time: the caller only gets
// the process once it started, so it couldn't stop it.
function started(
  server: ChildProcess,
  name: string,
  ready: string,
  stop: () => void = () => server.kill(),
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`${name} didn't start in ${START_TIMEOUT / 1000}s: ${output}`));
    }, START_TIMEOUT);
    const read = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(ready)) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout!.on("data", read);
    server.stderr!.on("data", read);
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${name} exited (${code}): ${output}`));
    });
  });
}
