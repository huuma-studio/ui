// How element names and attributes are written, the same way by the server
// renderer, `jsxAttr()` and the browser runtime (spec #131).
import { devWarn } from "../utils/dev.ts";
import { BOOLEAN_ATTRIBUTES } from "./boolean-attributes.ts";

// An XML name, like React's check: `NameStartChar` and `NameChar` of XML 1.0,
// https://www.w3.org/TR/xml/#NT-NameStartChar. Other names could close the
// start tag or add attributes in server-rendered HTML, e.g. a spread prop
// named `x onmouseover=alert(1) y`.
//
// Stricter than needed today: the HTML parser only ends an attribute name at
// whitespace, `/`, `>` or `=`
// (https://html.spec.whatwg.org/multipage/parsing.html#attribute-name-state),
// and the DOM standard's `setAttribute()` now only rejects those, NUL and the
// empty name (https://dom.spec.whatwg.org/#valid-attribute-local-name; Chromium
// 155 accepts `@click`). Older browsers still throw on anything that isn't an
// XML name, which this rule keeps the browser runtime clear of.
const NAME_START =
  ":A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF" +
  "\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
const ATTRIBUTE_NAME = new RegExp(
  `^[${NAME_START}][${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`,
);

// Element names, including custom elements (`my-element`) and SVG's
// `foreignObject`. A tag name is code, never data.
const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9:._-]*$/;

// Attributes whose URL a browser can run as a `javascript:` URL.
const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src", "action", "formaction", "data"]);

// `javascript:`, also with the leading spaces and control characters and the
// tabs and newlines inside that URL parsing ignores (like React's check).
const JAVASCRIPT_URL =
  // oxlint-disable-next-line no-control-regex -- those control characters are the point.
  /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;

// String event handlers, e.g. `onclick="…"`. Huuma's events are `on-click`
// props with a function, which never become attributes.
const EVENT_HANDLER = /^on[a-z]/i;

export function isValidTagName(tag: string): boolean {
  return TAG_NAME.test(tag);
}

export function isValidAttributeName(name: string): boolean {
  return ATTRIBUTE_NAME.test(name);
}

/**
 * The value an attribute is written with, or `undefined` to leave it out:
 *
 * - Invalid names are left out, with a warning in development.
 * - Boolean attributes (`disabled`, `checked`, …) are `""` when the value
 *   is truthy, otherwise left out.
 * - `true`/`false` on other attributes: `aria-*` and `data-*` get `"true"`
 *   and `"false"`; others get `""` for `true` and are left out for `false`
 *   (React's rule).
 * - Strings and numbers become strings, except string event handlers
 *   (`onclick="…"`) and `javascript:` URLs in URL attributes (`href`,
 *   `src`, `action`, …), which are left out, with a warning in development.
 * - Anything else (`null`, `undefined`, objects, functions) is left out.
 */
export function attributeValue(name: string, value: unknown): string | undefined {
  if (!isValidAttributeName(name)) {
    devWarn(`Left out the attribute ${JSON.stringify(name)}: it isn't a valid attribute name.`);
    return undefined;
  }
  if (BOOLEAN_ATTRIBUTES.has(name)) return value ? "" : undefined;
  if (typeof value === "boolean") {
    const lower = name.toLowerCase();
    if (lower.startsWith("aria-") || lower.startsWith("data-")) return String(value);
    return value ? "" : undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (EVENT_HANDLER.test(name)) {
    devWarn(
      `Left out the attribute "${name}": event handlers can't be strings. ` +
        `Use on-${name.slice(2).toLowerCase()}={…} with a function.`,
    );
    return undefined;
  }
  const text = String(value);
  if (URL_ATTRIBUTES.has(name.toLowerCase()) && JAVASCRIPT_URL.test(text)) {
    devWarn(`Left out the attribute "${name}": it has a javascript: URL.`);
    return undefined;
  }
  return text;
}
