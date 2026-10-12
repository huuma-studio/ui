import { Fragment, jsx } from "./jsx.ts";
import type { JSX } from "./jsx.ts";

export { type JSX } from "./jsx.ts";
export { Fragment };

/**
 * The development JSX runtime (`@huuma/ui/jsx-dev-runtime`), which Vite uses
 * in dev mode. The transform also passes `isStaticChildren`, the source
 * position and `this`; Huuma doesn't use them yet, so it builds the same
 * node as `jsx()`.
 */
export function jsxDEV(
  type: string | JSX.Component,
  props: JSX.ComponentProps,
  key?: string | number,
): JSX.Element {
  return jsx(type, props, key);
}
