import { join } from "@std/path/join";
import { Fragment, type JSX, jsx } from "../../jsx-runtime/mod.ts";
import type { PageScripts, Script } from "./parcel.ts";
import type { Island } from "../../islands/islands.ts";

interface ScriptsProps extends JSX.ElementProps {
  scripts?: { entryPoints: Script[] };
  nonce?: string;
}
// Preload, attach csp nonce and load head scripts
export function Scripts(
  { scripts, nonce }: ScriptsProps,
): // deno-lint-ignore no-explicit-any
JSX.Element<any> | null {
  if (!scripts?.entryPoints?.length) return null;

  const templates: string[] = [];
  const nodes: JSX.Node[] = [];

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

interface LaunchProps extends JSX.ElementProps {
  body?: PageScripts["body"];
  nonce?: string;
  islands?: Island[];
}
export function Launch(
  { body, nonce, islands }: LaunchProps,
): // deno-lint-ignore no-explicit-any
JSX.Element<any> | null {
  if (!body?.runtime || !islands?.length) return null;

  const templates: string[] = [];
  const nodes: string[] = [];
  const _islands = [];

  templates.push(`import { launch } from "/${body.runtime.path}";\n`);
  nodes.push("");

  // TODO: Serialize props (including Signals with serializable inner values)
  let i = 1;
  for (const island of islands) {
    templates.push(`import $I${i} from "/${island.path}";\n`);
    nodes.push("");

    // Remove children.
    const { children: _, ...props } =
      (<JSX.Element<JSX.Component>> island.node).props;
    _islands.push(
      `{fn: $I${i}, props: ${JSON.stringify(props)}, islandId: "${island.id}"}`,
    );

    i++;
  }

  templates.push(`launch([${_islands.join()}]);`);
  nodes.push("");

  return jsx("script", {
    children: [{
      templates,
      nodes,
    }],
    type: "module",
    nonce,
  });
}

interface PreloadProps extends JSX.ElementProps {
  preloadScripts: string[] | null;
}

// deno-lint-ignore no-explicit-any
export function Preload(props: PreloadProps): JSX.Element<any> | null {
  return props.preloadScripts &&
    jsx(Fragment, {
      children: props.preloadScripts.map((script) =>
        jsx("link", { rel: "preload", href: join("/", script), as: "script" })
      ),
    });
}
