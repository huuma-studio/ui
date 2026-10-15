import { escape } from "../../utils/escape.ts";
import { toText } from "../../utils/text.ts";

import { create as createSync } from "../../v-node/sync.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";
import { BOOLEAN_ATTRIBUTES } from "../../jsx-runtime/boolean-attributes.ts";
import { attributeValue, isValidTagName } from "../../jsx-runtime/attributes.ts";
import { create } from "../../v-node/async.ts";
import {
  type VElement,
  type VGlobalOptions,
  type VNode,
  VNodeProps,
  type VText,
  VType,
} from "../../v-node/mod.ts";

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

export async function renderToString(
  node: JSX.Element,
  globalOptions: VGlobalOptions,
): Promise<string> {
  return stringify(await create(node, globalOptions));
}

export function renderToStringSync(node: JSX.Element, globalOptions?: VGlobalOptions): string {
  return stringify(createSync<unknown>(node, globalOptions));
}

function stringify<T>(vNode: VNode<T>): string {
  if (!vNode) return "";
  switch (vNode.type) {
    case VType.TEXT:
      return vNode[VNodeProps.SKIP_ESCAPING] ? textFromVText(vNode) : escape(textFromVText(vNode));
    case VType.ELEMENT:
      return elementToString(vNode);
    case VType.COMPONENT:
      return stringify(vNode[VNodeProps.AST]);
    case VType.FRAGMENT:
      return vNode[VNodeProps.CHILDREN]?.map((child) => stringify(child)).join("") ?? "";
    default:
      throw Error("Node type is not supported!");
  }
}

// Elements whose content HTML doesn't decode: escaping their text would
// break the script or style.
const RAW_TEXT_TAGS = new Set(["script", "style"]);

function elementToString<T>(vNode: VElement<T>): string {
  const tag = vNode[VNodeProps.TAG];
  const props = vNode[VNodeProps.PROPS];
  if (!isValidTagName(tag)) {
    throw new TypeError(`Can't render the element ${JSON.stringify(tag)}: invalid tag name.`);
  }

  if (selfClosingTags.includes(tag)) {
    const { dangerouslySetInnerHTML: _d, children: _c, ...p } = props;
    return `<${tag}${stringFrom(p)}/>`;
  }

  const children = vNode[VNodeProps.CHILDREN];

  const { dangerouslySetInnerHTML, children: _c, ...attributes } = props;
  if (dangerouslySetInnerHTML) {
    return `<${tag}${stringFrom(attributes)}>${dangerouslySetInnerHTML.__html}</${tag}>`;
  }
  if (RAW_TEXT_TAGS.has(tag.toLowerCase())) {
    // The whole content first, then made safe once: a closing tag split
    // across children (`{"</sty"}{"le>"}`) only appears once they're joined.
    const content = children?.map((child) => rawContent(child)).join("") ?? "";
    return `<${tag}${stringFrom(attributes)}>${rawText(content, tag)}</${tag}>`;
  }
  return `<${tag}${stringFrom(attributes)}>${
    children?.map((child) => stringify(child)).join("") ?? ""
  }</${tag}>`;
}

/**
 * The content of a `<script>` or `<style>` element: text as it is, also
 * inside fragments and components. Elements become their markup, which
 * the browser reads as text there.
 */
function rawContent<T>(vNode: VNode<T>): string {
  if (!vNode) return "";
  switch (vNode.type) {
    case VType.TEXT:
      return textFromVText(vNode);
    case VType.COMPONENT:
      return rawContent(vNode[VNodeProps.AST]);
    case VType.FRAGMENT:
      return vNode[VNodeProps.CHILDREN]?.map((child) => rawContent(child)).join("") ?? "";
    default:
      return stringify(vNode);
  }
}

/**
 * The content of a `<script>` or `<style>` element, unescaped (HTML doesn't
 * decode entities there), with the sequences that could end it early made
 * harmless:
 *
 * - `<script` and `</script`, in any case: their `s` becomes `\u0073` (or
 *   `\u0053`), which JavaScript and JSON read as `s` (like React 19). The
 *   opening one matters too: after `<!--`, `<script` would make the browser
 *   ignore the element's real `</script>`.
 * - `</style`, in any case: becomes `<\/style`, which CSS reads as `</style`.
 */
function rawText(text: string, tag: string): string {
  if (tag.toLowerCase() === "script") {
    return text.replace(
      /(<\/?)(s)(cript)/gi,
      (_, start: string, s: string, rest: string) =>
        `${start}\\u00${s === "s" ? "73" : "53"}${rest}`,
    );
  }
  return text.replace(/<\/(style)/gi, "<\\/$1");
}

function stringFrom(attributes: JSX.Attributes): string {
  let attributesString = "";
  for (const key in attributes) {
    const attribute = attributes[key];
    const value = attributeValue(key, attribute);
    if (value === undefined) continue;
    // `true` and boolean attributes as the bare name, the same as `=""`.
    attributesString +=
      value === "" && (attribute === true || BOOLEAN_ATTRIBUTES.has(key))
        ? ` ${key}`
        : ` ${key}="${escape(value)}"`;
  }
  return attributesString;
}

function textFromVText<T>(vText: VText<T>): string {
  return toText(vText[VNodeProps.TEXT]);
}
