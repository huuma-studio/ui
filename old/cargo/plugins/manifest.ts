import { EntryPoints } from "../bundler/bundler.ts";
import { ParcelTaskConfig } from "../parcel.ts";
import { plugins } from "./plugins.ts";

type PluginsManifestConfig = {
  path: string;
  assetsPath: string;
};

export async function pluginsManifest(
  config: PluginsManifestConfig,
): Promise<EntryPoints> {
  const _parcelConfig: ParcelTaskConfig = (await import(config.path)).default;

  return (
    (
      await plugins({
        plugins: _parcelConfig.plugins,
        assetsPath: config.assetsPath,
      })
    ).entryPoints || {}
  );
}
