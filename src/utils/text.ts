import type { JSX } from "../jsx-runtime/jsx.ts";

/**
 * The content of a text node: the text itself, or a signal's current value
 * as a string. Server rendering and the browser share it so both show the
 * same text.
 */
export function toText(text: string | JSX.SignalLike): string {
  // Like `${value}`: a signal holding null, undefined or a boolean shows
  // "null", "undefined", "true" or "false", while the same static values
  // render nothing (spec #132).
  return typeof text === "string" ? text : String(text.get());
}
