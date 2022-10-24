import { denoPlugin, esbuild, parse } from "./deps.ts";
import { Plugin } from "./tasks/parcel.ts";

interface BundleProps {
  islands: Record<string, JSX.Component>;
  plugins?: Plugin[];
}

let esbuildInit = false;

export async function bundle(props: BundleProps) {
  const entryPoints: Record<string, string> = {
    main: new URL("../platform/browser/launch.ts", import.meta.url).href,
  };

  for (const island in props.islands) {
    entryPoints[`island-${parse(island).name}`] = `./${island}`;
  }

  // TODO: Optimise for performance
  if (Array.isArray(props.plugins)) {
    for (const key in props.plugins) {
      props.plugins[key].entryPoints?.forEach((plugin) => {
        Object.keys(plugin).forEach((key) => entryPoints[key] = plugin[key]);
      });
    }
  }

  if (Deno.run === undefined && !esbuildInit) {
    await esbuild.initialize({
      wasmURL: "https://deno.land/x/esbuild@v0.15.6/esbuild.wasm",
      worker: false,
    });
    esbuildInit = true;
  }

  const result = await esbuild.build({
    /*
       * Supress error in esbuild 15.x
       @ts-ignore */
    plugins: [denoPlugin({
      importMapURL: new URL("./import_map.json", `file://${Deno.cwd()}/`),
    })],
    entryPoints,
    bundle: true,
    format: "esm",
    treeShaking: true,
    splitting: true,
    outdir: ".",
    minify: true,
    platform: "neutral",
    write: false,
    jsxFactory: "tag",
    absWorkingDir: Deno.cwd(),
    target: ["chrome99", "firefox99", "safari15"],
  });

  return result.outputFiles;
}
