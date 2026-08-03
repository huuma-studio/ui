// Serialize JSON for embedding inside an inline <script> element.
//
// HTML tokenization does not honor JavaScript string quoting: the first
// `</script>` sequence (or the sequences that enter the tokenizer's
// script-data-escaped states, which both begin with `<`) terminates or
// derails the script element. JSON.stringify alone therefore cannot be
// used to interpolate application data into a raw-text element.
//
// Escaping every literal `<` as the JavaScript escape \u003C is
// sufficient because every sequence that can terminate or change the
// parser state of script data begins with `<`. U+2028 and U+2029 are
// escaped defensively: ES2019 made both legal inside JavaScript string
// literals, so the module script this feeds is fine either way, but
// they remain hazardous if the payload is ever re-embedded or consumed
// by an older parser. The parsed value is unchanged; only the bytes the
// HTML tokenizer sees change.
//
// This must NOT be routed through the HTML entity escaping path: script
// content uses the HTML raw-text parsing mode and does not decode
// character references, so HTML entities would corrupt the JavaScript.

export function inlineJSON(value: unknown): string {
  // JSON.stringify returns undefined for top-level values it cannot
  // represent (undefined, functions, symbols). Emitting the JavaScript
  // identifier `undefined` or silently coercing to null would change
  // the value, so throw instead to give the function an honest return
  // type.
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new TypeError("inlineJSON: value is not JSON-serializable");
  }

  return json
    .replaceAll("<", "\\u003C")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
