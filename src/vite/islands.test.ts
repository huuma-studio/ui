import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createServer, isRunnableDevEnvironment, parseSync, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";

import type { JSX } from "../jsx-runtime/mod.ts";
import { huuma } from "./mod.ts";
import { hookSignature, ISLANDS_ID, islandPath, RUNTIME_ID, runtimePath } from "./islands.ts";

const fixture = fileURLToPath(new URL("../../test/fixtures/basic", import.meta.url));

describe(hookSignature.name, () => {
  const signature = (code: string) => hookSignature(parseSync("island.js", code).program, code);
  const counter = (body: string) => `export default function Counter() { ${body} }`;

  test("stays the same when only other code changes", () => {
    expect(signature(counter("const n = $signal(0); return n;"))).toStrictEqual(
      signature(
        "import { x } from './x.ts';\n" +
          counter("const n = $signal(0);\nconsole.log(n);\nreturn [n, x];"),
      ),
    );
  });

  test("changes when a hook is added, removed, reordered or gets other arguments", () => {
    const base = signature(counter("const a = $signal(0); const b = $ref(null);"));
    for (const body of [
      "const a = $signal(0); const b = $ref(null); const c = $signal(1);",
      "const a = $signal(0);",
      "const b = $ref(null); const a = $signal(0);",
      "const a = $signal(1); const b = $ref(null);",
    ]) {
      expect(signature(counter(body)), body).not.toStrictEqual(base);
    }
  });

  test("changes when a $computed or $effect function changes", () => {
    expect(signature(counter("$computed(() => a.get() * 2);"))).not.toStrictEqual(
      signature(counter("$computed(() => a.get() * 3);")),
    );
    expect(signature(counter("$effect(() => log(a));"))).not.toStrictEqual(
      signature(counter("$effect(() => log(b));")),
    );
  });

  test("counts hooks called through a namespace", () => {
    const namespace = (body: string) =>
      `import * as hooks from "@huuma/ui/hooks/signal";\n${counter(body)}`;
    const base = signature(namespace("const a = hooks.$signal(0);"));
    for (const body of [
      "const a = hooks.$computed(() => 1);",
      "const a = hooks.$signal(0); const b = hooks.$signal(1);",
      'const a = hooks["$signal"](1);',
      "const a = hooks?.$signal(1);",
    ]) {
      expect(signature(namespace(body)), body).not.toStrictEqual(base);
    }
    expect(signature(namespace("const a = hooks.$signal(0); log(a);"))).toStrictEqual(base);
  });

  test("counts hooks imported under another name", () => {
    const aliased = (body: string) =>
      'import { $signal as signal, "$computed" as computed } from "@huuma/ui/hooks/signal";\n' +
      counter(body);
    const base = signature(aliased("const a = signal(0);"));
    for (const body of [
      "const a = signal(1);",
      "const a = signal(0); const b = signal(0);",
      "const a = signal(0); const b = computed(() => 1);",
    ]) {
      expect(signature(aliased(body)), body).not.toStrictEqual(base);
    }
    expect(signature(aliased("const a = signal(0); log(a);"))).toStrictEqual(base);
  });

  test("changes when a hook's import changes but its local name doesn't", () => {
    const body = counter("const a = hook(0); const b = hooks.$signal(0); const c = $signal(0);");
    const imports = (hook: string, namespace: string, signal: string) =>
      `import { ${hook} as hook } from "@huuma/ui/hooks/signal";\n` +
      `import * as hooks from "${namespace}";\n` +
      `import { $signal } from "${signal}";\n`;
    const base = signature(
      imports("$signal", "@huuma/ui/hooks/signal", "@huuma/ui/hooks/signal") + body,
    );
    for (const changed of [
      imports("$computed", "@huuma/ui/hooks/signal", "@huuma/ui/hooks/signal"),
      imports("$signal", "./hooks.ts", "@huuma/ui/hooks/signal"),
      imports("$signal", "@huuma/ui/hooks/signal", "./hooks.ts"),
    ]) {
      expect(signature(changed + body), changed).not.toStrictEqual(base);
    }
    // Other imports and their order don't matter.
    expect(
      signature(
        'import { x } from "./x.ts";\n' +
          imports("$signal", "@huuma/ui/hooks/signal", "@huuma/ui/hooks/signal")
            .split("\n")
            .reverse()
            .join("\n") +
          body,
      ),
    ).toStrictEqual(base);
  });
});

describe("browser paths", () => {
  test("are relative to the root and start with the base", () => {
    expect(islandPath("/srv/app", "/", "/srv/app/app/counter.client.tsx")).toStrictEqual(
      "app/counter.client.tsx",
    );
    expect(islandPath("/srv/app", "/shop/", "/srv/app/app/counter.client.tsx")).toStrictEqual(
      "shop/app/counter.client.tsx",
    );
    // Encoded, so the browser requests the file Vite serves.
    expect(
      islandPath("/srv/app", "/", "/srv/app/components/50%off a/tag.client.tsx"),
    ).toStrictEqual("components/50%25off%20a/tag.client.tsx");
    expect(runtimePath("/")).toStrictEqual("@id/__x00__virtual:huuma/runtime");
    expect(runtimePath("/shop/")).toStrictEqual("shop/@id/__x00__virtual:huuma/runtime");
  });
});

describe("island modules", () => {
  let server: ViteDevServer;
  beforeAll(async () => {
    server = await createServer({
      root: fixture,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [huuma()],
    });
  });
  afterAll(async () => {
    await server.close();
  });

  test(`${ISLANDS_ID} maps browser paths to the islands on the server`, async () => {
    const ssr = server.environments.ssr;
    if (!isRunnableDevEnvironment(ssr)) throw new Error("ssr environment is not runnable");
    const { default: islands } = (await ssr.runner.import(ISLANDS_ID)) as {
      default: Record<string, { default: JSX.Component }>;
    };

    // Project-wide, including islands outside the routes directory.
    expect(Object.keys(islands).sort()).toStrictEqual([
      "app/counter.client.tsx",
      "app/remote/sum.client.tsx",
      "components/greeting.client.tsx",
    ]);
    // The same module instance a page gets when it imports the island:
    // the server recognizes islands by component identity.
    const page = (await ssr.runner.import("/app/counter.client.tsx")) as {
      default: JSX.Component;
    };
    expect(islands["app/counter.client.tsx"].default).toBe(page.default);
  });

  test(`${RUNTIME_ID} exports the browser runtime to the client`, async () => {
    const result = await server.environments.client.transformRequest(RUNTIME_ID);
    expect(result?.code).toMatch(
      /export \{ hotReplaceIsland, launch \} from "[^"]*\/src\/platform\/browser\/mod\.ts"/,
    );
  });

  test("island modules accept their own hot updates in the browser", async () => {
    const client = await server.environments.client.transformRequest("/app/counter.client.tsx");
    expect(client?.code).toContain("import.meta.hot.accept((next) =>");
    // With the module's hook signature, to keep the islands' state.
    expect(client?.code).toMatch(
      /const hooks = "[0-9a-f]{16}";\s*import\.meta\.hot\.data\.hooks = hooks;/,
    );
    expect(client?.code).toContain("$huuma$hotReplaceIsland(path, next.default, { keepState })");
    expect(client?.code).toMatch(
      /import \{ hotReplaceIsland as \$huuma\$hotReplaceIsland \} from "\/@id\/__x00__virtual:huuma\/runtime"/,
    );
    // The server renders them without.
    const ssr = await server.environments.ssr.transformRequest("/app/counter.client.tsx");
    expect(ssr?.code).not.toContain("hotReplaceIsland");
  });

  test("each stays in its environment", async () => {
    await expect(server.environments.client.transformRequest(ISLANDS_ID)).rejects.toThrow(
      "server only",
    );
    await expect(server.environments.ssr.transformRequest(RUNTIME_ID)).rejects.toThrow(
      "browser runtime",
    );
  });
});
