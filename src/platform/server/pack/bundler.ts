import * as esbuild from "@esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { parse } from "@std/path/parse";
import { EOL } from "@std/fs/eol";

export type EntryPoint =
  | {
    path: string;
    isEntryPoint: boolean;
  }
  | {
    path: string;
    isIsland: boolean;
  }
  | {
    path: string;
    isRuntime: boolean;
  } & {
    imports?: [];
  };

export type EntryPoints = Record<
  string,
  EntryPoint
>;

let isInitialized: boolean | Promise<void> = false;

async function initialize() {
  if (isInitialized === false) {
    isInitialized = esbuild.initialize({});
    await isInitialized;
    isInitialized = true;
  } else if (isInitialized instanceof Promise) {
    await isInitialized;
  }
}

interface OutputFile extends esbuild.OutputFile {
  isEntryPoint: boolean;
  isIsland: boolean;
  isRuntime: boolean;
  imports: {
    path: string;
    kind: esbuild.ImportKind | "file-loader";
    external?: boolean;
  }[];
}

export class Bundler {
  constructor() {}

  async bundle(
    entryPoints: EntryPoints,
    isProd = true,
  ): Promise<{ hash: string; files: Map<string, OutputFile> }> {
    await initialize();

    const result = await esbuild.build({
      plugins: [actionsPlugin, ...denoPlugins({})],
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
      platform: "neutral",
      metafile: true,
      write: false,
      jsx: "automatic",
      jsxImportSource: "@huuma/ui",
      absWorkingDir: Deno.cwd(),
      target: ["chrome99", "firefox99", "safari15"],
    });

    const files = new Map<string, OutputFile>();
    let hash: string = "";

    result.outputFiles?.forEach((file) => {
      const metaInfo = result.metafile.outputs[parse(file.path).base];

      hash = hash.concat(hash, file.hash);
      const entryPoint: EntryPoint | undefined =
        entryPoints[parse(file.path).name];

      files.set(parse(file.path).base, {
        isEntryPoint: entryPoint && "isEntryPoint" in entryPoint &&
          entryPoint.isEntryPoint,
        isIsland: entryPoint && "isIsland" in entryPoint && entryPoint.isIsland,
        isRuntime: entryPoint && "isRuntime" in entryPoint &&
          entryPoint.isRuntime,
        imports: metaInfo.imports,
        ...file,
      });
    });

    return { hash: await generateHash(hash), files };
  }

  stop() {
    esbuild.stop();
  }
}

export async function generateHash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
  ).map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  ).slice(0, 8);
}

const actionsPlugin: esbuild.Plugin = {
  name: "huuma-actions-plugin",
  setup(build) {
    build.onLoad({ filter: /\.actions\.ts$/ }, async (args) => {
      // Look into the file in scope and find the names of all exported functions
      const fileContent = await Deno.readTextFile(args.path);

      const exportedFunctions = [];

      // Pattern 1: export [async] function name() {...}
      const namedExportRegex = /export\s+(async\s+)?function\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = namedExportRegex.exec(fileContent)) !== null) {
        exportedFunctions.push(match[2]);
      }

      // Pattern 2: export default [async] function name() {...}
      const defaultNamedExportRegex =
        /export\s+default\s+(async\s+)?function\s+(\w+)/g;
      while ((match = defaultNamedExportRegex.exec(fileContent)) !== null) {
        exportedFunctions.push(match[2]);
      }

      // Pattern 3: export const name = function() {...} or export const name = () => {...}
      const constFunctionExportRegex =
        /export\s+const\s+(\w+)\s*=\s*(async\s+)?(\(?.*?\)?\s*=>|function\b)/g;
      while ((match = constFunctionExportRegex.exec(fileContent)) !== null) {
        exportedFunctions.push(match[1]);
      }

      const fileName = parse(args.path).name;
      const fileHash = await generateHash(args.path.replace(Deno.cwd(), ""));

      // Create exports for each function found
      const exportContents = `
        ${
        exportedFunctions.map((fn) => {
          if (fn === "default") {
            return `export default async function ${fn}(...args){
            return fetch("/_huuma/${fileHash}/${fileName}", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                args,
                action: "${fn}",
              }),
            }).then(res=>res.json());};`;
          }
          return `export async function ${fn}(...args){
          return fetch("/_huuma/actions/${fileHash}/${fileName}", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              args,
              action: "${fn}",
            }),
          }).then(res=>res.json());};`;
        }).join(EOL)
      }
      `;

      return {
        contents: exportContents,
        loader: "js",
      };
    });
  },
};

const _noServerImports: esbuild.Plugin = {
  name: "no-server-file-imports",
  setup(build) {
    build.onResolve({ filter: /\.server\.(ts|tsx)$/ }, () => {
      throw new Error(
        "(.server.ts / .server.tsx) Explicit server code is not allowed to be imported on the client side.",
      );
    });
  },
};
