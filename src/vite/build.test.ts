import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createBuilder } from "vite";
import { type ChildProcess, spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { builtPath } from "./client-build.ts";
import { huuma } from "./mod.ts";

const fixtures = fileURLToPath(new URL("../../test/fixtures", import.meta.url));

type Manifest = Record<string, { file: string; name?: string; imports?: string[] }>;

// A manifest chunk and the chunks it imports, also indirectly.
function loaded(manifest: Manifest, key: string): Set<string> {
  const keys = new Set<string>();
  const pending = [key];
  while (pending.length) {
    const next = pending.pop()!;
    if (keys.has(next)) continue;
    keys.add(next);
    pending.push(...(manifest[next]?.imports ?? []));
  }
  return keys;
}

// A port that's free right now.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

interface BuiltApp {
  fetch(
    request: Request,
    connection: { remoteAddr: { transport: string; hostname?: string; port?: number } },
  ): Promise<Response>;
}

describe("vite build", () => {
  // A copy of the basic fixture, built with `vite build`'s builder.
  let root: string;
  let app: BuiltApp;
  let manifest: Manifest;
  const nodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    // As with `vite build`; Vitest sets "test", which builds JSX in dev mode.
    process.env.NODE_ENV = "production";
    root = await mkdtemp(join(fixtures, ".tmp-build-"));
    await cp(join(fixtures, "basic"), root, { recursive: true });
    const builder = await createBuilder({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [huuma()],
    });
    await builder.buildApp();
    manifest = JSON.parse(
      await readFile(join(root, "dist/client/.vite/manifest.json"), "utf8"),
    ) as Manifest;
    app = (
      (await import(pathToFileURL(join(root, "dist/server/app.js")).href)) as {
        default: BuiltApp;
      }
    ).default;
  });
  afterAll(async () => {
    process.env.NODE_ENV = nodeEnv;
    await rm(root, { recursive: true, force: true });
  });

  const fetchPage = (path: string) =>
    app.fetch(new Request(new URL(path, "http://localhost")), {
      remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 },
    });

  test("builds the runtime and the islands for the browser, with a manifest", async () => {
    const files = await readdir(join(root, "dist/client/assets"));
    for (const name of ["runtime", "counter.client", "greeting.client", "sum.client"]) {
      expect(
        files.some((file) => file.startsWith(`${name}-`)),
        name,
      ).toStrictEqual(true);
    }
    expect(manifest["app/counter.client.tsx"]?.file).toMatch(/^assets\/counter\.client-.+\.js$/);
  });

  test("shares @huuma/ui between the runtime and the islands", () => {
    const runtime = Object.keys(manifest).find((key) => manifest[key]?.name === "runtime")!;
    const fromRuntime = loaded(manifest, runtime);
    // One signal runtime: each island loads chunks that the runtime loads.
    for (const island of ["app/counter.client.tsx", "components/greeting.client.tsx"]) {
      const shared = [...loaded(manifest, island)].filter((key) => fromRuntime.has(key));
      expect(shared.length, island).toBeGreaterThan(0);
    }
  });

  test("leaves hot updates out of the runtime", async () => {
    const runtime = Object.values(manifest).find((chunk) => chunk.name === "runtime")!;
    const code = await readFile(join(root, "dist/client", runtime.file), "utf8");
    expect(code).toContain("launch");
    expect(code).not.toContain("An island must render a component.");
  });

  test("builds the app as a fetch handler that loads the built scripts", async () => {
    const runtime = Object.values(manifest).find((chunk) => chunk.name === "runtime")!;
    const counter = manifest["app/counter.client.tsx"]!;

    const response = await fetchPage("/");
    expect(response.status).toStrictEqual(200);
    const html = await response.text();
    expect(html).toContain("<h1>Home</h1>");
    expect(html).toContain(`import { launch } from "/${runtime.file}";`);
    expect(html).toContain(`from "/${counter.file}";`);
    expect(html).not.toContain("@id/");
  });
});

describe("node dist/server/server.js", () => {
  // Another build of the basic fixture, started like in production.
  let root: string;
  let server: ChildProcess;
  let origin: string;
  let manifest: Manifest;
  const nodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = "production";
    root = await mkdtemp(join(fixtures, ".tmp-build-server-"));
    await cp(join(fixtures, "basic"), root, { recursive: true });
    const builder = await createBuilder({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [huuma()],
    });
    await builder.buildApp();
    manifest = JSON.parse(
      await readFile(join(root, "dist/client/.vite/manifest.json"), "utf8"),
    ) as Manifest;

    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [join(root, "dist/server/server.js")], {
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
  });
  afterAll(async () => {
    process.env.NODE_ENV = nodeEnv;
    server?.kill();
    await rm(root, { recursive: true, force: true });
  });

  test("renders pages", async () => {
    const response = await fetch(`${origin}/`);
    expect(response.status).toStrictEqual(200);
    expect(await response.text()).toContain("<h1>Home</h1>");
  });

  test("serves the client build's files", async () => {
    const counter = manifest["app/counter.client.tsx"]!;
    const response = await fetch(`${origin}/${counter.file}`);
    expect(response.status).toStrictEqual(200);
    expect(response.headers.get("content-type")).toStrictEqual("text/javascript");
    expect(response.headers.get("cache-control")).toStrictEqual(
      "public, max-age=31536000, immutable",
    );
    expect(await response.text()).toContain("export");
  });

  test("doesn't serve the client manifest", async () => {
    const response = await fetch(`${origin}/.vite/manifest.json`);
    expect(response.status).toStrictEqual(404);
  });
});

describe(builtPath.name, () => {
  test("starts with the base and encodes each segment", () => {
    expect(builtPath("/", "assets/a-1.js")).toStrictEqual("assets/a-1.js");
    expect(builtPath("/shop/", "assets/a-1.js")).toStrictEqual("shop/assets/a-1.js");
    expect(builtPath("/", "assets/50%off a-1.js")).toStrictEqual("assets/50%25off%20a-1.js");
  });
});
