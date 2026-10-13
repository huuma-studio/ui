// Renders a copy of the basic fixture built by the Deno pipeline, as the
// app's own Deno program: `rendered.test.ts` runs it in the copy, whose
// `deno.json` resolves "@huuma/ui" to this repository. Writes the result to
// `rendered.txt`, since route logs to stdout.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { list } from "../../src/platform/server/pack/list/mod.ts";
import { renderFixture } from "../rendered.ts";

const { default: app } = await import(pathToFileURL(join(process.cwd(), "server.ts")).href);
await list(app, { isProd: true, enableLiveReload: false });
await writeFile("rendered.txt", await renderFixture({ fetch: app.deliver() }));
