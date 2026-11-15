import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, type ViteDevServer } from "vite";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { huuma } from "./mod.ts";
import { SERVER_ONLY } from "./server-only.ts";

const fixtures = fileURLToPath(new URL("../../test/fixtures", import.meta.url));

describe("SERVER_ONLY", () => {
  test("matches *.server.* with any extension", () => {
    for (const id of [
      "/app/db.server.ts",
      "/app/db.server.tsx",
      "/app/db.server.js",
      "/app/db.server.mjs",
      "/app/keys.server.json",
      "/app/db.server.ts?import",
    ]) {
      expect(SERVER_ONLY.test(id), id).toStrictEqual(true);
    }
  });

  test("doesn't match other modules", () => {
    for (const id of [
      "/app/server.ts",
      "/app/server/db.ts",
      "/app/db.server",
      "/app/a.serverx.ts",
    ]) {
      expect(SERVER_ONLY.test(id), id).toStrictEqual(false);
    }
  });
});

describe("server-only modules", () => {
  // A copy of the basic fixture with an island that imports server code.
  let root: string;
  let server: ViteDevServer;
  beforeAll(async () => {
    root = await mkdtemp(join(fixtures, ".tmp-server-only-"));
    await cp(join(fixtures, "basic"), root, { recursive: true });
    await writeFile(
      join(root, "app/leak.client.tsx"),
      'import { host } from "./host.server.ts";\n\nexport default () => <p>{host()}</p>;\n',
    );
    server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma()],
    });
  });
  afterAll(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });

  test("can't be imported in the browser", async () => {
    // The island itself transforms; the browser then requests its import.
    await server.environments.client.transformRequest("/app/leak.client.tsx");
    await expect(
      server.environments.client.transformRequest("/app/host.server.ts"),
    ).rejects.toThrow(
      '"app/host.server.ts" is server-only code and can\'t be imported in the browser ' +
        "(imported by app/leak.client.tsx).",
    );
  });

  test("load on the server", async () => {
    const result = await server.environments.ssr.transformRequest("/app/leak.client.tsx");
    expect(result?.code).toContain("host.server.ts");
    expect((await server.environments.ssr.transformRequest("/app/host.server.ts"))?.code).toContain(
      "hostname",
    );
  });

  test("stay out of the browser behind a remote function", async () => {
    // `sum.remote.ts` imports `host.server.ts`; its browser stub doesn't.
    const result = await server.environments.client.transformRequest("/app/sum.remote.ts");
    expect(result?.code).not.toContain("host.server");
  });
});
