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
  const raw = RAW_TEXT_TAGS.has(tag.toLowerCase());
  return `<${tag}${stringFrom(attributes)}>${
    children
      ?.map((child) =>
        raw && child?.type === VType.TEXT ? rawText(textFromVText(child), tag) : stringify(child),
      )
      .join("") ?? ""
  }</${tag}>`;
}

/**
 * Text of a `<script>` or `<style>` element, unescaped: only its own closing
 * tag (`</script`, in any case) could end the element early, so that one
 * becomes `<\/script`, which JavaScript and CSS read as `</script`.
 */
function rawText(text: string, tag: string): string {
  return text.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
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
