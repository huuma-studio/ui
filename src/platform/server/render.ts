import {
  create,
  type VElement,
  type VGlobalOptions,
  type VNode,
  VNodeProps,
  type VText,
  VType,
} from "../../v-node/mod.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";

import { escapeHtml } from "../../utils/escape-html.ts";

const selfClosingTags = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

export function vNodeToString(vNode: VNode<unknown>): string {
  return stringify(vNode);
}

export function renderToString(
  node: JSX.Node,
  globalOptions?: VGlobalOptions,
): string {
  return stringify(create<unknown>(node, globalOptions));
}

function stringify<T>(vNode: VNode<T>): string {
  if (!vNode) return "";
  switch (vNode.type) {
    case VType.TEXT:
      return vNode[VNodeProps.SKIP_ESCAPING]
        ? textFromVText(vNode)
        : escapeHtml(textFromVText(vNode));
    case VType.ELEMENT:
      return elementToString(vNode);
    case VType.COMPONENT:
      return stringify(vNode[VNodeProps.AST]);
    case VType.FRAGMENT:
      return (
        vNode[VNodeProps.CHILDREN]?.map((child) => stringify(child)).join("") ??
          ""
      );
    default:
      throw Error("Node type is not supported!");
  }
}

function elementToString<T>(vNode: VElement<T>): string {
  const tag = vNode[VNodeProps.TAG];
  const props = vNode[VNodeProps.PROPS];

  if (selfClosingTags.includes(tag)) {
    const { dangerouslySetInnerHTML: _, ...p } = props;
    return `<${tag}${stringFrom(p)}/>`;
  }

  const children = vNode[VNodeProps.CHILDREN];

  const { dangerouslySetInnerHTML, ...attributes } = props;
  if (dangerouslySetInnerHTML) {
    return `<${tag}${
      stringFrom(attributes)
    }>${dangerouslySetInnerHTML.__html}</${tag}>`;
  }
  return `<${tag}${stringFrom(attributes)}>${
    children?.map((child) => stringify(child)).join("") ?? ""
  }</${tag}>`;
}

function stringFrom(attributes: JSX.IntrinsicElements): string {
  let attributesString = "";
  for (const key in attributes) {
    const attribute = attributes[key];
    if (typeof attribute === "string") {
      attributesString += ` ${key}="${escapeHtml(attribute)}"`;
    }
    if (attribute === true) {
      attributesString += ` ${key}`;
    }
  }
  return attributesString;
}

function textFromVText<T>(vText: VText<T>): string {
  return typeof vText[VNodeProps.TEXT] === "object" &&
      "get" in vText[VNodeProps.TEXT]
    ? `${vText[VNodeProps.TEXT].get}`
    : `${vText[VNodeProps.TEXT]}`;
}
