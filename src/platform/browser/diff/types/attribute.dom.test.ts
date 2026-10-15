// @vitest-environment happy-dom
// The server renderer and the browser runtime write the same attributes
// (spec #131): what a page gets from the server is what hydration or an
// update in the browser produces.
import { describe, expect, test, vi } from "vite-plus/test";

import { jsx } from "../../../../jsx-runtime/mod.ts";
import { type VElement, VNodeProps } from "../../../../v-node/mod.ts";
import { renderToStringSync } from "../../../server/render.ts";
import {
  attribute,
  type AttributeChangeSet,
  compareAttributes,
  setAttribute,
} from "./attribute.ts";

const CASES: Record<string, unknown>[] = [
  { "aria-expanded": false },
  { "aria-expanded": true },
  { "data-open": true },
  { "data-open": false },
  { title: true },
  { title: false },
  { title: "x", tabindex: 0 },
  { disabled: true, hidden: false },
  { href: "javascript:alert(1)" },
  { onclick: "alert(1)" },
  { "x onerror=alert(1)": "1", "data-ok": "1" },
];

// The attributes of an element, sorted by name.
function attributesOf(element: Element): [string, string][] {
  return [...element.attributes]
    .map((a): [string, string] => [a.name, a.value])
    .sort(([a], [b]) => a.localeCompare(b));
}

// The element the server renders for `props`.
function fromServer(props: Record<string, unknown>): Element {
  const template = document.createElement("template");
  template.innerHTML = renderToStringSync(jsx("button", { ...props }));
  return template.content.firstElementChild!;
}

// A browser element with `props` applied by the runtime's diff.
function vElementWith(props: Record<string, unknown>, node: Element): VElement<Node> {
  return <VElement<Node>>(<unknown>{
    type: 1,
    [VNodeProps.TAG]: "button",
    [VNodeProps.PROPS]: props,
    [VNodeProps.EVENT_REFS]: [],
    [VNodeProps.CHILDREN]: [],
    [VNodeProps.NODE_REF]: node,
  });
}

describe("attributes in the browser and from the server", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});

  test.each(CASES)("are the same when the browser sets %o", (props) => {
    const node = document.createElement("button");
    const vElement = vElementWith(props, node);
    for (const name in props) {
      for (const change of setAttribute(name, props[name], vElement)) attribute(change);
    }
    expect(attributesOf(node)).toStrictEqual(attributesOf(fromServer(props)));
  });

  test.each(CASES)("are the same after an update to %o", (props) => {
    // From the opposite booleans, so every boolean changes.
    const previous = Object.fromEntries(
      Object.entries(props).map(([name, value]) => [
        name,
        typeof value === "boolean" ? !value : value,
      ]),
    );
    const node = document.createElement("button");
    const before = vElementWith(previous, node);
    for (const name in previous) {
      for (const change of setAttribute(name, previous[name], before)) attribute(change);
    }
    for (const change of compareAttributes(vElementWith(props, node), before)) {
      attribute(change as AttributeChangeSet);
    }
    expect(attributesOf(node)).toStrictEqual(attributesOf(fromServer(props)));
  });
});
