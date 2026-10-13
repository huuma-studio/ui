import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createBuilder, type InlineConfig } from "vite";
import { type ChildProcess, spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { remoteEndpoint } from "../platform/server/remote.ts";
import { builtPath } from "./client-build.ts";
import { hasHash } from "./build.ts";
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

// Builds a copy of the basic fixture with `vite build`'s builder.
async function buildFixture(prefix: string, config: InlineConfig = {}): Promise<string> {
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

// Starts `dist/server/server.js` like in production; resolves with its origin.
async function startServer(root: string): Promise<{ origin: string; server: ChildProcess }> {
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
    root = await buildFixture(".tmp-build-");
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
    root = await buildFixture(".tmp-build-server-");
    manifest = JSON.parse(
      await readFile(join(root, "dist/client/.vite/manifest.json"), "utf8"),
    ) as Manifest;
    ({ origin, server } = await startServer(root));
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

describe("a build with a URL base, e.g. a CDN", () => {
  let root: string;
  let server: ChildProcess;
  let origin: string;
  let manifest: Manifest;
  const nodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = "production";
    root = await buildFixture(".tmp-build-cdn-", { base: "https://cdn.example/shop/" });
    manifest = JSON.parse(
      await readFile(join(root, "dist/client/.vite/manifest.json"), "utf8"),
    ) as Manifest;
    ({ origin, server } = await startServer(root));
  });
  afterAll(async () => {
    process.env.NODE_ENV = nodeEnv;
    server?.kill();
    await rm(root, { recursive: true, force: true });
  });

  test("loads the scripts from the base's URL", async () => {
    const counter = manifest["app/counter.client.tsx"]!;
    const html = await (await fetch(`${origin}/shop/`)).text();
    expect(html).toContain("<h1>Home</h1>");
    expect(html).toContain(`from "https://cdn.example/shop/${counter.file}";`);
  });

  test("serves the app and the client files below the base's path", async () => {
    const counter = manifest["app/counter.client.tsx"]!;
    expect((await fetch(`${origin}/shop/about`)).status).toStrictEqual(200);
    expect((await fetch(`${origin}/shop/${counter.file}`)).status).toStrictEqual(200);
    const root = await fetch(`${origin}/`, { redirect: "manual" });
    expect(root.headers.get("location")).toStrictEqual("/shop/");
  });

  test("calls remote functions on the app's server, not on the CDN", async () => {
    // Bundled into the island that calls it.
    const island = manifest["app/remote/sum.client.tsx"]!;
    const stub = await readFile(join(root, "dist/client", island.file), "utf8");
    const endpoint = `/shop${await remoteEndpoint("app/sum.remote.ts")}`;
    expect(stub).toContain(`fetch(\`${endpoint}\``);
    expect(stub).not.toContain("cdn.example");
  });
});

// Also when the import's name doesn't show it's server-only code.
test.each(["./host.server.ts", "./host.server", "#host"])(
  "fails when an island imports server-only code: %s",
  async (specifier) => {
    const root = await mkdtemp(join(fixtures, ".tmp-build-server-only-"));
    try {
      await cp(join(fixtures, "basic"), root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ type: "module", imports: { "#host": "./app/host.server.ts" } }),
      );
      await writeFile(
        join(root, "app/leak.client.tsx"),
        `import { host } from "${specifier}";\n` +
          "export default function Leak() { return <p>{host()}</p>; }\n",
      );
      const builder = await createBuilder({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [huuma()],
      });
      await expect(builder.buildApp()).rejects.toThrow(
        '"app/host.server.ts" is server-only code and can\'t be imported in the browser ' +
          "(imported by app/leak.client.tsx).",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

describe("a build with unhashed file names", () => {
  let root: string;
  let server: ChildProcess;
  let origin: string;
  let manifest: Manifest;
  const nodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = "production";
    root = await buildFixture(".tmp-build-unhashed-", {
      environments: {
        client: { build: { rolldownOptions: { output: { chunkFileNames: "[name].js" } } } },
      },
    });
    manifest = JSON.parse(
      await readFile(join(root, "dist/client/.vite/manifest.json"), "utf8"),
    ) as Manifest;
    ({ origin, server } = await startServer(root));
  });
  afterAll(async () => {
    process.env.NODE_ENV = nodeEnv;
    server?.kill();
    await rm(root, { recursive: true, force: true });
  });

  test("caches them briefly, and hashed files for good", async () => {
    // An island, named by `chunkFileNames`.
    const counter = manifest["app/counter.client.tsx"]!;
    expect(counter.file).toStrictEqual("counter.client.js");
    const island = await fetch(`${origin}/${counter.file}`);
    expect(island.headers.get("cache-control")).toStrictEqual("public, max-age=3600");

    // The runtime, named by Vite's `entryFileNames`.
    const runtime = Object.values(manifest).find((chunk) => chunk.name === "runtime")!;
    expect(runtime.file).toMatch(/^assets\/runtime-.+\.js$/);
    const entry = await fetch(`${origin}/${runtime.file}`);
    expect(entry.headers.get("cache-control")).toStrictEqual("public, max-age=31536000, immutable");
  });
});

describe(hasHash.name, () => {
  const options = {
    entryFileNames: "assets/[name]-[hash].js",
    chunkFileNames: "assets/[name].js",
    assetFileNames: (asset: { names: string[] }) =>
      asset.names[0] === "logo.svg" ? "[name][extname]" : "assets/[name]-[hash:12][extname]",
  };
  const chunk = (fileName: string, isEntry: boolean, facadeModuleId: string | null = null) =>
    ({ type: "chunk", fileName, isEntry, facadeModuleId, name: "x" }) as Parameters<
      typeof hasHash
    >[0];
  const asset = (fileName: string, name: string) =>
    ({ type: "asset", fileName, names: [name] }) as unknown as Parameters<typeof hasHash>[0];

  test("by the pattern that named the file", () => {
    expect(hasHash(chunk("assets/app-B2x_9-aZ.js", true), options)).toStrictEqual(true);
    expect(hasHash(chunk("assets/jsx.js", false), options)).toStrictEqual(false);
    expect(hasHash(asset("assets/app-1a2b3c4d5e6f.css", "app.css"), options)).toStrictEqual(true);
    expect(hasHash(asset("logo.svg", "logo.svg"), options)).toStrictEqual(false);
    // An unhashed entry named like a hashed chunk.
    const entries = { ...options, entryFileNames: "[name].js", chunkFileNames: "[name]-[hash].js" };
    expect(hasHash(chunk("main-app1234.js", true), entries)).toStrictEqual(false);
  });

  test("by `chunkFileNames` for emitted entries, like the islands", () => {
    const island = "/app/my-counter.client.tsx";
    const emitted = new Set([island]);
    // `chunkFileNames` has no hash, although the name would fit `entryFileNames`.
    expect(hasHash(chunk("assets/my-counter1.js", true, island), options, emitted)).toStrictEqual(
      false,
    );
    expect(hasHash(chunk("assets/my-counter1.js", true, island), options)).toStrictEqual(true);
  });

  test("only with a hash of its length", () => {
    // An unhashed chunk whose name has a dash, e.g. `main-app`.
    expect(
      hasHash(chunk("assets/main-app.js", false), {
        ...options,
        chunkFileNames: "assets/[name]-[hash].js",
      }),
    ).toStrictEqual(false);
    expect(hasHash(asset("assets/app-1a2b3c4d.css", "app.css"), options)).toStrictEqual(false);
  });

  test("not for a file named otherwise, e.g. by its plugin", () => {
    expect(hasHash(chunk("sw.js", true), options)).toStrictEqual(false);
    expect(hasHash(asset(".vite/manifest.json", "manifest.json"), options)).toStrictEqual(false);
  });
});

describe(builtPath.name, () => {
  test("starts with the base and encodes each segment", () => {
    expect(builtPath("/", "assets/a-1.js")).toStrictEqual("assets/a-1.js");
    expect(builtPath("/shop/", "assets/a-1.js")).toStrictEqual("shop/assets/a-1.js");
    expect(builtPath("/", "assets/50%off a-1.js")).toStrictEqual("assets/50%25off%20a-1.js");
  });

  test("is a URL with a URL base, and after / with a relative one", () => {
    expect(builtPath("https://cdn.example/shop/", "assets/a-1.js")).toStrictEqual(
      "https://cdn.example/shop/assets/a-1.js",
    );
    expect(builtPath("//cdn.example/", "assets/a-1.js")).toStrictEqual(
      "//cdn.example/assets/a-1.js",
    );
    expect(builtPath("./", "assets/a-1.js")).toStrictEqual("assets/a-1.js");
  });
});
