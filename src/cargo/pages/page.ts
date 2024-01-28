import { parse } from "std/path/mod.ts";
import { create, tag, VComponent, vNodeToString } from "../deps.ts";
import { htmlAttributes } from "./html.ts";
import { getHead, Head } from "./head.ts";
import { bodyAttributes } from "./body.ts";
import { Footer, footer, getFooter } from "./footer.ts";
import { findIslands, type Island } from "../islands/islands.ts";
import { BUILD_ID } from "../constants.ts";
import { PageLike } from "../tasks/parcel.ts";
import { EOL } from "std/fs/mod.ts";

const LINEBREAK = EOL.LF ?? EOL;

interface PageFromProps {
  page: PageLike;
  layouts?: PageLike[];
  islands?: Record<string, JSX.Component>;
  scripts?: string[];
  params: Record<string, string | undefined>;
  data: unknown;
}

export function pageFrom(props: PageFromProps) {
  let islands: Island[] = [];
  const scripts = props.scripts || [];

  const vNode = <VComponent<unknown>> create(
    nestLayouts(
      tag(
        <JSX.Component> props.page,
        { params: props.params, data: props.data },
        [],
      ),
      props.layouts,
      props.params,
      props.data,
    ),
  );

  if (props.islands) {
    islands = findIslands(vNode, props.islands);
  }

  if (islands.length) {
    footer({
      script: [
        ...scripts,
        `<script type="module">import { launch } from "/_parcel/${BUILD_ID}/main.js";
${
          islands.filter((island, index, arr) => {
            return arr.findIndex((i) => i.path === island.path) === index;
          }).map((island) =>
            `import ${
              parse(island.path).name.replaceAll("-", "")
            } from "/_parcel/${BUILD_ID}/island-${
              parse(island.path).name
            }.js";${LINEBREAK}`
          ).join("")
        }
launch([${
          islands.map((island) => {
            return `{ class: "${island.class}", node: ${
              parse(island.path).name.replaceAll("-", "")
            }, props: ${JSON.stringify(island.props)} }`;
          }).join()
        }]);</script>`,
      ],
    });
  }

  return htmlFrom({
    body: vNodeToString(vNode),
    head: getHead(),
    htmlAttributes: htmlAttributes(),
    bodyAttributes: bodyAttributes(),
    footer: getFooter(),
  });
}

interface HtmlFromProps {
  body: string;
  head?: Head;
  htmlAttributes?: string[];
  bodyAttributes?: string[];
  footer?: Footer;
}

function htmlFrom(props: HtmlFromProps) {
  return `<!DOCTYPE html><html ${props.htmlAttributes?.join(" ")}><head>${
    props.head?.base || ""
  }<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${
    props.head?.meta?.join("") || ""
  }${props.head?.link?.join("") || ""}${props.head?.style?.join("") || ""}${
    props.head?.script?.join("") || ""
  }${props.head?.noscript?.join("") || ""}${
    props.head?.title || ""
  }</head><body ${props.bodyAttributes?.join(" ") || ""}>${props.body}${
    props.footer?.script?.join("") || ""
  }${props.footer?.noscript?.join("") || ""}</body></html>`;
}

function nestLayouts(
  page: JSX.Element,
  layouts?: PageLike[],
  params?: Record<string, string | undefined>,
  data?: unknown,
) {
  if (layouts?.length) {
    return layouts.reduce<JSX.Element>((accumulator, currentLayout) => {
      return tag(<JSX.Component> currentLayout, {
        params,
        data,
      }, [accumulator]);
    }, page);
  }
  return page;
}
