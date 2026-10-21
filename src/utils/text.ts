import type { JSX } from "../jsx-runtime/jsx.ts";
import { isTextNode } from "../v-node/mod.ts";

/**
 * The content of a text node: the text itself, or a signal's current value
 * as text. Server rendering and the browser share it so both show the
 * same text.
 */
export function toText(text: string | JSX.SignalLike): string {
  return typeof text === "string" ? text : valueToText(text.get());
}

/**
 * A signal's value as text, by the rule for the same value written
 * statically in JSX: what isn't text (`null`, `undefined`, booleans, `NaN`
 * and `±Infinity`) is empty (spec #132).
 */
export function valueToText(value: JSX.SignalValue): string {
  return isTextNode(value) ? String(value) : "";
}
