// Builds copies of the basic fixture and starts them like in production, for
// the build tests and the browser tests.
import { createBuilder, type InlineConfig } from "vite";
import { type ChildProcess, spawn } from "node:child_process";
import { cp, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
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
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const read = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("Listening on")) resolve();
    };
    server.stdout!.on("data", read);
    server.stderr!.on("data", read);
    server.once("exit", (code) => reject(new Error(`server.js exited (${code}): ${output}`)));
  });
  return { origin: `http://127.0.0.1:${port}`, server };
}
