import type { JSX } from "../jsx-runtime/jsx.ts";

/**
 * The content of a text node: the text itself, or a signal's current value
 * as text. Server rendering and the browser share it so both show the
 * same text.
 */
export function toText(text: string | JSX.SignalLike): string {
  return typeof text === "string" ? text : valueToText(text.get());
}

/**
 * A signal's value as text. `null`, `undefined`, `true` and `false` are
 * empty, like the same values written statically in JSX (spec #132).
 */
export function valueToText(value: JSX.SignalValue): string {
  return value == null || typeof value === "boolean" ? "" : String(value);
}
