import type { Plugin, UserConfig } from "vite";
import { join, parse } from "node:path";

import { listIslands } from "../platform/server/discover.ts";
import { RUNTIME_INPUT } from "./client-build.ts";
import { SERVER_ID } from "./entry.ts";
import { RUNTIME_ID } from "./islands.ts";

/**
 * The production build (`vite build`): the client environment builds the
 * browser runtime and the islands into `dist/client`, with a manifest;
 * then the ssr environment builds the app into `dist/server`, reading the
 * client's manifest for the islands' browser paths.
 */
export function buildPlugin(root: () => string): Plugin {
  return {
    name: "huuma:build",
    config(config) {
      const outDir = config.build?.outDir ?? "dist";
      return {
        // `vite build` builds every environment, through `buildApp`.
        builder: {},
        environments: {
          client: {
            build: {
              outDir: config.environments?.client?.build?.outDir ?? join(outDir, "client"),
              manifest: true,
              rolldownOptions: {
                // The islands are added in `buildStart`, once discovered.
                input: { [RUNTIME_INPUT]: RUNTIME_ID },
                // The page's launch script imports the runtime's `launch`
                // and each island's default export: Vite's app builds
                // would drop them as unused.
                preserveEntrySignatures: "exports-only",
              },
            },
          },
          ssr: {
            build: {
              outDir: config.environments?.ssr?.build?.outDir ?? join(outDir, "server"),
              rolldownOptions: { input: { app: SERVER_ID } },
            },
          },
        },
      } satisfies UserConfig;
    },
    // The server reads the client's manifest, so the client builds first.
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.ssr);
    },
    async buildStart() {
      if (this.environment.config.consumer !== "client" || this.environment.mode !== "build") {
        return;
      }
      for (const island of await listIslands(root())) {
        this.emitFile({
          type: "chunk",
          id: join(island.filePath, island.fileName),
          name: parse(island.fileName).name,
          preserveSignature: "exports-only",
        });
      }
    },
  };
}
