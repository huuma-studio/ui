import { join } from "@std/path/join";

import { Fragment, type JSX, jsx } from "../../jsx-runtime/mod.ts";
import type { PageScripts, Script, TransferState } from "./app.ts";
import type { Island } from "../../islands/islands.ts";

interface ScriptsProps extends JSX.ComponentProps {
  scripts?: { entryPoints: Script[] };
  nonce?: string;
}
// TODO: change to proper jsx as soon jsr supports it
// Preload, attach csp nonce and load head scripts
export function Scripts(
  { scripts, nonce }: ScriptsProps,
): JSX.Element {
  if (!scripts?.entryPoints?.length) return null;

  const templates: string[] = [];
  const nodes: JSX.Element[] = [];

  for (const script of scripts.entryPoints) {
    templates.push("");
    nodes.push(jsx("script", {
      src: `/${script.path}`,
      type: "module",
      nonce,
    }));
  }

  return jsx(Fragment, {
    children: [{
      templates,
      nodes,
    }],
  });
}

interface LaunchProps extends JSX.ComponentProps {
  body?: PageScripts["body"];
  nonce?: string;
  islands?: Island[];
  transferState?: TransferState;
}
export function Launch(
  { body, nonce, islands, transferState }: LaunchProps,
): JSX.Element {
  if (!body?.runtime || !islands?.length) return null;

  const templates: string[] = [];
  const nodes: string[] = [];
  const _islands = [];

  templates.push(`import { launch } from "/${body.runtime.path}";`);
  nodes.push("\n");

  let i = 1;
  for (const island of islands) {
    templates.push(`import $I${i} from "/${island.path}";\n`);
    nodes.push("\n");

    // Remove children.
    const { children: _, ...props } =
      (<JSX.ComponentNode<JSX.Component>> island.node).props;
    _islands.push(
      `{fn: $I${i}, props: ${JSON.stringify(props)}, islandId: "${island.id}"}`,
    );

    i++;
  }

  templates.push(
    `const transferState = ${JSON.stringify(transferState ?? {})};`,
  );
  nodes.push("\n");

  templates.push(`launch([${_islands.join()}], transferState);`);
  nodes.push("\n");

  return jsx(Fragment, {
    children: [
      jsx("script", {
        children: [{
          templates,
          nodes,
        }],
        type: "module",
        nonce,
      }),
    ],
  });
}

interface PreloadProps extends JSX.ComponentProps {
  preloadScripts: string[] | null;
}

export function Preload(props: PreloadProps): JSX.Element | null {
  return props.preloadScripts &&
    jsx(Fragment, {
      children: props.preloadScripts.map((script) =>
        jsx("link", { rel: "preload", href: join("/", script), as: "script" })
      ),
    });
}
