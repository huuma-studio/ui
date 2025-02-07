import * as esbuild from "@esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { parse } from "@std/path/parse";

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
      plugins: [...denoPlugins({})],
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
      jsxImportSource: "@cargo/parcel",
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

    return { hash: await this.generateHash(hash), files };
  }

  async generateHash(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    return Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    ).map((b) => b.toString(16).padStart(2, "0")).join(
      "",
    ).slice(0, 8);
  }

  stop() {
    esbuild.stop();
  }
}
