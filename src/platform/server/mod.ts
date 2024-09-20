import {
  create,
  type VElement,
  type VNode,
  VNodeProps,
  type VText,
  VType,
} from "../../ant/mod.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";

import { escapeHtml } from "./utils.ts";

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

export function renderToString(node: JSX.Node): string {
  return stringify(create<unknown>(node));
}

function stringify<T>(vNode: VNode<T>): string {
  if (!vNode) return "";
  switch (vNode.type) {
    case VType.TEXT:
      return vNode[VNodeProps.SKIP_ESCAPING]
        ? getTextFromVText(vNode)
        : escapeHtml(getTextFromVText(vNode));
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
    return `<${tag}${stringFrom(props)}/>`;
  }

  const children = vNode[VNodeProps.CHILDREN];

  const { unsafeInnerHTML, ...attributes } = props;
  if (unsafeInnerHTML) {
    return `<${tag}${stringFrom(attributes)}>${unsafeInnerHTML}</${tag}>`;
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

function getTextFromVText<T>(vText: VText<T>): string {
  return typeof vText[VNodeProps.TEXT] === "object" &&
    "get" in vText[VNodeProps.TEXT]
    ? `${vText[VNodeProps.TEXT].get}`
    : `${vText[VNodeProps.TEXT]}`;
}
