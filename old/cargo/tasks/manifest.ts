import { join } from "@std/path/join";
import { type EntryPoints } from "../bundler/bundler.ts";
import { islandsManifest } from "../islands/manifest.ts";
import { pagesManifest } from "../pages/manifest.ts";
import { pluginsManifest } from "../plugins/manifest.ts";
import { scriptsManifest } from "../scripts/manifest.ts";
import { BUILD_ID } from "../constants.ts";

import { mapIslandsToEntryPoints } from "../islands/manifest.ts";
import { createManifestDirectory } from "../manifest/manifest.ts";
import { Cargo } from "@cargo/cargo";

export type ManifestTaskConfig = {
  prod: boolean;
  pagesPath?: string;
  islandsPath?: string;
  parcelConfigPath?: string;
  preBundle?: boolean;
};

export const Manifest: (
  cargo: Cargo,
  config?: ManifestTaskConfig,
) => Promise<Cargo> = async function (cargo, config) {
  await createManifestDirectory();

  const _islands = await islandsManifest({
    path: config?.islandsPath || "src",
  });

  await pagesManifest({
    path: config?.pagesPath || "pages",
  });

  const _entryPoints: EntryPoints = mapIslandsToEntryPoints(_islands);

  /*
  // get plugins for manifest
  const _pluginsEntryPoints = await pluginsManifest({
    path: config?.parcelConfigPath || join("config", "parcel.ts"),
    // TODO: remove duplicate path definition -> tasks/Parcel.ts
    assetsPath: join("_parcel", BUILD_ID),
  });

  for (const [name, path] of Object.entries(_pluginsEntryPoints)) {
    _entryPoints[name] = path;
  }

  */

  _entryPoints["main"] = new URL(
    "../../platform/browser/launch.ts",
    import.meta.url,
  ).href;

  console.log(_entryPoints);

  // create scripts manifest
  await scriptsManifest({
    entryPoints: _entryPoints,
    manifestPath: ".manifest",
    manifestFileName: ".scripts.ts",
    manifestAssetspath: ".scripts",
  });
  return cargo;
};
