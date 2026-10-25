import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createBuilder } from "vite";
import type { ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { buildFixture, fixtures, IMAGE_PAGE, startServer } from "../../test/build.ts";
import { renderFixture } from "../../test/rendered.ts";
import { remoteEndpoint } from "../platform/server/remote.ts";
import { builtPath } from "./client-build.ts";
import { hasHash, moveServerAssets } from "./build.ts";
import { huuma, node } from "./mod.ts";

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

  test("builds the app and Node's server, and no other platform's files", async () => {
    const server = await readdir(join(root, "dist/server"));
    expect(server).toStrictEqual(expect.arrayContaining(["app.js", "server.js"]));
    expect(server).not.toContain("worker.js");
    const client = await readdir(join(root, "dist/client"));
    expect(client).not.toContain("_headers");
    expect(client).not.toContain(".assetsignore");
  });

  test("renders the pages like the Deno pipeline", async () => {
    // The snapshot is what the Deno pipeline rendered before it was removed.
    await expect(await renderFixture(app)).toMatchFileSnapshot("../../test/snapshots/basic.txt");
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
    root = await buildFixture(".tmp-build-server-", {}, IMAGE_PAGE);
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

  test("serves the files the server imports, from the client build", async () => {
    const page = await (await fetch(`${origin}/image`)).text();
    const src = /src="([^"]+\.svg)"/.exec(page)?.[1];
    expect(src).toMatch(/^\/assets\/logo-[\w-]+\.svg$/);
    const response = await fetch(`${origin}${src}`);
    expect(response.status).toStrictEqual(200);
    expect(response.headers.get("content-type")).toStrictEqual("image/svg+xml");
    const server = await readdir(join(root, "dist/server"), { recursive: true });
    expect(server).not.toContainEqual(expect.stringMatching(/\.svg$/));
  });

  test("doesn't serve the client manifest", async () => {
    expect((await fetch(`${origin}/.vite/manifest.json`)).status).toStrictEqual(404);
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
      await readFile(join(root, "dist/client/shop/.vite/manifest.json"), "utf8"),
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

  test("builds the client files below the base's path, as their URLs", async () => {
    const counter = manifest["app/counter.client.tsx"]!;
    expect(await readdir(join(root, "dist/client"))).toStrictEqual(["shop"]);
    await expect(readFile(join(root, "dist/client/shop", counter.file))).resolves.toBeDefined();
  });

  test("serves the app and the client files below the base's path", async () => {
    const counter = manifest["app/counter.client.tsx"]!;
    expect((await fetch(`${origin}/shop/about`)).status).toStrictEqual(200);
    const file = await fetch(`${origin}/shop/${counter.file}`);
    expect(file.status).toStrictEqual(200);
    expect(file.headers.get("cache-control")).toStrictEqual("public, max-age=31536000, immutable");
    const root = await fetch(`${origin}/`, { redirect: "manual" });
    expect(root.headers.get("location")).toStrictEqual("/shop/");
  });

  test("calls remote functions on the app's server, not on the CDN", async () => {
    // Bundled into the island that calls it.
    const island = manifest["app/remote/sum.client.tsx"]!;
    const stub = await readFile(join(root, "dist/client/shop", island.file), "utf8");
    const endpoint = `/shop${await remoteEndpoint("app/sum.remote.ts")}`;
    expect(stub).toContain(`fetch(\`${endpoint}\``);
    expect(stub).not.toContain("cdn.example");
  });
});

test("takes a base without a trailing slash like one with it", async () => {
  // Vite resolves "/shop" to "/shop/"; the client's directory is chosen before that.
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const root = await buildFixture(".tmp-build-slash-", { base: "/shop" });
  let server: ChildProcess | undefined;
  try {
    const manifest = JSON.parse(
      await readFile(join(root, "dist/client/shop/.vite/manifest.json"), "utf8"),
    ) as Manifest;
    const counter = manifest["app/counter.client.tsx"]!;
    let origin: string;
    ({ origin, server } = await startServer(root));

    const html = await (await fetch(`${origin}/shop/`)).text();
    expect(html).toContain("<h1>Home</h1>");
    expect(html).toContain(`from "/shop/${counter.file}";`);
    expect(await (await fetch(`${origin}/shop/about`)).text()).toContain("<h1>About</h1>");
    const file = await fetch(`${origin}/shop/${counter.file}`);
    expect(file.headers.get("cache-control")).toStrictEqual("public, max-age=31536000, immutable");
    const home = await fetch(`${origin}/`, { redirect: "manual" });
    expect(home.headers.get("location")).toStrictEqual("/shop/");
  } finally {
    process.env.NODE_ENV = nodeEnv;
    server?.kill();
    await rm(root, { recursive: true, force: true });
  }
});

// The directory is the decoded base, e.g. `sale%` for `/sale%25/`:
// `server.js` must find it through a URL.
test.each([
  ["/sale%25/", "sale%"],
  ["/x%2520/", "x%20"],
])("serves the files below the encoded base %s on Node", async (base, directory) => {
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const root = await buildFixture(".tmp-build-encoded-", { base });
  let server: ChildProcess | undefined;
  try {
    const manifest = JSON.parse(
      await readFile(join(root, "dist/client", directory, ".vite/manifest.json"), "utf8"),
    ) as Manifest;
    const counter = manifest["app/counter.client.tsx"]!;
    let origin: string;
    ({ origin, server } = await startServer(root));

    expect(await (await fetch(`${origin}${base}about`)).text()).toContain("<h1>About</h1>");
    const file = await fetch(`${origin}${base}${counter.file}`);
    expect(file.status).toStrictEqual(200);
    expect(file.headers.get("cache-control")).toStrictEqual("public, max-age=31536000, immutable");
  } finally {
    process.env.NODE_ENV = nodeEnv;
    server?.kill();
    await rm(root, { recursive: true, force: true });
  }
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

// `vite build` loads vite.config.ts once per environment, so each gets its
// own instance of the plugin (the other tests pass it inline, shared).
describe("a build from vite.config.ts, like `vite build`", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(fixtures, ".tmp-build-config-"));
    await cp(join(fixtures, "basic"), root, { recursive: true });
    const builder = await createBuilder({
      root,
      configFile: join(root, "vite.config.ts"),
      logLevel: "silent",
    });
    await builder.buildApp();
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("tells server.js which files have a hash", async () => {
    const server = await readFile(join(root, "dist/server/server.js"), "utf8");
    expect(server).toMatch(/hashed: \[\s*"assets\/[^"]+-[\w-]{8}\.js"/);
  });
});

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

describe("a build whose server files have no hash", () => {
  let root: string;
  let server: ChildProcess;
  let origin: string;
  // What the adapter's afterBuild hears.
  let hashed: ReadonlySet<string> | undefined;
  const nodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = "production";
    const adapter = node();
    adapter.afterBuild = async (_builder, build) => {
      hashed = build.hashed;
    };
    root = await buildFixture(
      ".tmp-build-unhashed-server-",
      {
        plugins: [huuma({ adapter })],
        environments: {
          ssr: {
            build: { rolldownOptions: { output: { assetFileNames: "assets/[name][extname]" } } },
          },
        },
      },
      IMAGE_PAGE,
    );
    ({ origin, server } = await startServer(root));
  });
  afterAll(async () => {
    process.env.NODE_ENV = nodeEnv;
    server?.kill();
    await rm(root, { recursive: true, force: true });
  });

  test("caches the files the server imports briefly", async () => {
    const page = await (await fetch(`${origin}/image`)).text();
    expect(page).toContain('src="/assets/logo.svg"');
    const image = await fetch(`${origin}/assets/logo.svg`);
    expect(image.status).toStrictEqual(200);
    expect(image.headers.get("cache-control")).toStrictEqual("public, max-age=3600");
  });

  test("tells the adapter which files have a hash, not the server's", () => {
    // For its platform, e.g. Workers' `_headers`.
    expect([...hashed!]).toContainEqual(expect.stringMatching(/^assets\/runtime-.+\.js$/));
    expect(hashed).not.toContain("assets/logo.svg");
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

describe(moveServerAssets.name, () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(fixtures, ".tmp-move-assets-"));
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  test("moves the files to the client build, unless it has them", async () => {
    const server = join(root, "server");
    const client = join(root, "client");
    await mkdir(join(server, "assets"), { recursive: true });
    await mkdir(join(client, "assets"), { recursive: true });
    await writeFile(join(server, "assets/logo-a1.svg"), "server");
    // An island imports this one too.
    await writeFile(join(server, "assets/icon-b2.svg"), "server");
    await writeFile(join(client, "assets/icon-b2.svg"), "server");

    expect(
      await moveServerAssets(server, client, [
        "assets/logo-a1.svg",
        "assets/icon-b2.svg",
        "assets/gone-c3.svg",
      ]),
    ).toStrictEqual(["assets/logo-a1.svg"]);
    expect(await readdir(join(server, "assets"))).toStrictEqual([]);
    expect((await readdir(join(client, "assets"))).sort()).toStrictEqual([
      "icon-b2.svg",
      "logo-a1.svg",
    ]);
    expect(await readFile(join(client, "assets/icon-b2.svg"), "utf8")).toStrictEqual("server");
  });

  test("fails for a different file at the same path", async () => {
    const server = join(root, "other-server");
    const client = join(root, "other-client");
    await mkdir(join(server, "assets"), { recursive: true });
    await mkdir(join(client, "assets"), { recursive: true });
    await writeFile(join(server, "assets/logo.svg"), "server");
    // E.g. from `public/`, with unhashed `assetFileNames`.
    await writeFile(join(client, "assets/logo.svg"), "public");

    await expect(moveServerAssets(server, client, ["assets/logo.svg"])).rejects.toThrow(
      "The server code imports assets/logo.svg, but the client build has a different file",
    );
    expect(await readFile(join(server, "assets/logo.svg"), "utf8")).toStrictEqual("server");
    expect(await readFile(join(client, "assets/logo.svg"), "utf8")).toStrictEqual("public");
  });
});
