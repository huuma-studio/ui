/*
 * Boolean HTML attributes per the WHATWG HTML spec: their presence makes
 * them true regardless of their value, their absence makes them false.
 * The JSX runtime must therefore omit these attributes entirely when the
 * bound value is falsy instead of emitting them verbatim.
 *
 * https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#boolean-attribute
 */
export const BOOLEAN_ATTRIBUTES: Set<string> = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
  "shadowrootclonable",
  "shadowrootdelegatesfocus",
  "shadowrootserializable",
]);
