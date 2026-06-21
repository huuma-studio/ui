import * as esbuild from "@esbuild";
import { denoPlugin } from "@deno/esbuild-plugin";
import { parse } from "@std/path/parse";
import { relative } from "@std/path/relative";
import { EOL } from "@std/fs/eol";
import { generateHash, toCanonicalPath } from "./utils.ts";

export type EntryPoint =
  & {
    path: string;
    imports?: string[];
  }
  & (
    | { isEntryPoint: boolean }
    | { isIsland: boolean }
    | { isRuntime: boolean }
  );

export type EntryPoints = Record<
  string,
  EntryPoint
>;

interface OutputFile extends esbuild.OutputFile {
  isEntryPoint: boolean;
  isIsland: boolean;
  isRuntime: boolean;
  imports: {
    path: string;
    kind: esbuild.ImportKind | "file-loader";
    external?: boolean;
  }[];
  contents: Uint8Array<ArrayBuffer>;
}

let initPromise: Promise<void> | null = null;

async function initialize() {
  if (!initPromise) {
    initPromise = esbuild.initialize({}).catch((err) => {
      // Allow a retry on the next call if initialization fails.
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

export class Bundler {
  constructor() {}

  async bundle(
    { entryPoints, isProd = true, shims }: {
      entryPoints: EntryPoints;
      isProd?: boolean;
      shims?: string[];
    },
  ): Promise<{ hash: string; files: Map<string, OutputFile> }> {
    await initialize();

    const result = await esbuild.build({
      plugins: [
        noServerImportsClientSidePlugin,
        remoteFunctionsPlugin,
        denoPlugin({ preserveJsx: true }),
      ],
      entryPoints: Object.entries(entryPoints).reduce((acc, [key, value]) => {
        acc[key] = value.path;
        return acc;
      }, {} as Record<string, string>),
      bundle: true,
      format: "esm",
      treeShaking: true,
      splitting: true,
      outdir: ".",
      minify: isProd,
      platform: "browser",
      metafile: true,
      write: false,
      jsx: "automatic",
      jsxImportSource: "@huuma/ui",
      absWorkingDir: Deno.cwd(),
      target: ["chrome99", "firefox99", "safari15"],
      inject: shims ?? [],
    });

    const files = new Map<string, OutputFile>();
    let hash: string = "";

    result.outputFiles?.forEach((file) => {
      const metaInfo = result.metafile?.outputs[parse(file.path).base];
      hash = hash.concat(file.hash);
      const entryPoint: EntryPoint | undefined =
        entryPoints[parse(file.path).name];

      files.set(parse(file.path).base, {
        isEntryPoint: (entryPoint && "isEntryPoint" in entryPoint &&
          entryPoint.isEntryPoint) ?? false,
        isIsland: (entryPoint && "isIsland" in entryPoint &&
          entryPoint.isIsland) ?? false,
        isRuntime: (entryPoint && "isRuntime" in entryPoint &&
          entryPoint.isRuntime) ?? false,
        imports: metaInfo?.imports ?? [],
        ...file,
        contents: new Uint8Array(file.contents),
      });
    });

    return { hash: await generateHash(hash), files };
  }

  async stop(): Promise<void> {
    await esbuild.stop();
    initPromise = null;
  }
}

const remoteFunctionsPlugin: esbuild.Plugin = {
  name: "huuma-remote-function-plugin",
  setup(build) {
    build.onLoad({ filter: /\.remote\.ts$/ }, async (args) => {
      // Look into the file in scope and find the names of all exported functions
      const fileContent = await Deno.readTextFile(args.path);

      const exportedFunctions = new Set<string>();
      let hasDefaultExport = false;

      // Pattern 1: export [async] function name() {...}
      const namedExportRegex = /export\s+(async\s+)?function\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = namedExportRegex.exec(fileContent)) !== null) {
        exportedFunctions.add(match[2]);
      }

      // Pattern 2: export const name = function() {...} or export const name = () => {...}
      const constFunctionExportRegex =
        /export\s+const\s+(\w+)\s*=\s*(async\s+)?(\(?.*?\)?\s*=>|function\b)/g;
      while ((match = constFunctionExportRegex.exec(fileContent)) !== null) {
        exportedFunctions.add(match[1]);
      }

      // Pattern 3: export default ... (named function, anonymous function,
      // arrow function, or identifier re-export). On the server side the
      // default export is always reachable via the "default" key of the
      // namespace import, so we only need to know that one exists.
      const defaultExportRegex = /export\s+default\b/;
      if (defaultExportRegex.test(fileContent)) {
        hasDefaultExport = true;
      }

      const fileName = parse(args.path).name;
      const fileHash = await generateHash(
        toCanonicalPath(relative(Deno.cwd(), args.path)),
      );
      const endpoint = `/_huuma/remote/${fileHash}/${fileName}`;

      const buildFetch = (remoteFunction: string) =>
        `fetch(${JSON.stringify(endpoint)}, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            args,
            remoteFunction: ${JSON.stringify(remoteFunction)},
          }),
        }).then(async (res) => {
          if (res.status === 204) return undefined;
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            const err = new Error(
              body?.message ??
                ("Remote function " + ${
          JSON.stringify(remoteFunction)
        } + " failed (HTTP " + res.status + ")"),
            );
            err.name = body?.name ?? "RemoteFunctionError";
            throw err;
          }
          return res.json();
        })`;

      // Create exports for each function found
      const namedExports = [...exportedFunctions].map((fn) =>
        `export async function ${fn}(...args){ return ${buildFetch(fn)}; }`
      );

      const defaultExport = hasDefaultExport
        ? [
          `export default async function(...args){ return ${
            buildFetch("default")
          }; }`,
        ]
        : [];

      const exportContents = [...namedExports, ...defaultExport].join(EOL);

      return {
        contents: exportContents,
        loader: "js",
      };
    });
  },
};

const noServerImportsClientSidePlugin: esbuild.Plugin = {
  name: "huuma-no-server-imports-client-side-plugin",
  setup(build) {
    build.onResolve({ filter: /\.server\.(ts|tsx)$/ }, () => {
      throw new Error(
        "(.server.ts / .server.tsx) Explicit server code is not allowed to be imported on the client side.",
      );
    });
  },
};
