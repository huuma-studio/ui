import { denoPlugins, esbuild } from "./deps.ts";

export type EntryPoints = Record<string, string>;

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

export class Bundler {
  private files:
    | undefined
    | Map<string, Uint8Array>
    | Promise<Map<string, Uint8Array>>;

  constructor(
    private entryPoints: EntryPoints,
    private parse: (path: string) => { base: string },
  ) {}

  async bundle(isProd = true): Promise<Map<string, Uint8Array>> {
    await initialize();

    const result = await esbuild.build({
      // @ts-ignore: Ignore plugin type error.
      plugins: [
        ...denoPlugins({
          importMapURL: `file://${Deno.cwd()}/import_map.json`,
        }),
      ],
      entryPoints: this.entryPoints,
      bundle: true,
      format: "esm",
      treeShaking: true,
      splitting: true,
      outdir: ".",
      minify: isProd,
      platform: "neutral",
      write: false,
      jsx: "automatic",
      jsxImportSource: "parcel",
      absWorkingDir: Deno.cwd(),
      target: ["chrome99", "firefox99", "safari15"],
    });

    const files = new Map<string, Uint8Array>();

    result.outputFiles?.forEach(
      (file: { path: string; contents: Uint8Array }) => {
        files.set(
          this.parse(file.path).base.replaceAll("$", ""),
          file.contents,
        );
      },
    );

    this.files = files;
    return files;
  }

  async #cache() {
    if (typeof this.files === "undefined") {
      this.files = this.bundle();
    }
    if (this.files instanceof Promise) {
      await this.files;
    }

    return <Map<string, Uint8Array>>this.files;
  }

  async resolve(fileName: string): Promise<Uint8Array | undefined> {
    return (await this.#cache()).get(fileName);
  }

  stop() {
    esbuild.stop();
  }
}
