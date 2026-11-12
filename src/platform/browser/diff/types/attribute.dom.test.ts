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
  { DISABLED: 0, Hidden: 1 },
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

describe("an input's value", () => {
  test("is cleared by false, like the server leaves it out", () => {
    const node = document.createElement("input");
    const before = vElementWith({ value: "typed" }, node);
    for (const change of setAttribute("value", "typed", before)) attribute(change);
    expect(node.value).toStrictEqual("typed");

    for (const change of compareAttributes(vElementWith({ value: false }, node), before)) {
      attribute(change as AttributeChangeSet);
    }
    expect(node.value).toStrictEqual("");
    expect(node.hasAttribute("value")).toStrictEqual(false);
    expect(renderToStringSync(jsx("input", { value: false }))).toStrictEqual("<input/>");
  });

  test("takes strings and numbers as they are", () => {
    const node = document.createElement("input");
    for (const value of ["a", 5]) {
      for (const change of setAttribute("value", value, vElementWith({ value }, node))) {
        attribute(change);
      }
      expect(node.value).toStrictEqual(String(value));
    }
  });
});

// An update changes the class names and the style properties the client
// rendered differently, and leaves the ones an extension or a script added.
describe("class and style in an update", () => {
  // `node` with `previous` applied, then updated to `props`. `between`
  // stands for an extension, a script or the user.
  function update(
    node: Element,
    previous: Record<string, unknown>,
    props: Record<string, unknown>,
    between: () => void = () => {},
  ): void {
    const before = vElementWith(previous, node);
    for (const name in previous) {
      for (const change of setAttribute(name, previous[name], before)) attribute(change);
    }
    between();
    for (const change of compareAttributes(vElementWith(props, node), before)) {
      attribute(change as AttributeChangeSet);
    }
  }
  const classes = (node: Element) => [...node.classList].sort();
  // By index: happy-dom's style isn't iterable.
  const properties = ({ style }: HTMLElement) =>
    Array.from({ length: style.length }, (_, i) => style[i]).sort();

  test("keeps a class that was added, and changes the client's", () => {
    const node = document.createElement("button");
    update(node, { class: "a b" }, { class: "c a" }, () => node.classList.add("dark"));
    expect(classes(node)).toStrictEqual(["a", "c", "dark"]);
  });

  test("adds the client's first class to the ones that are there", () => {
    const node = document.createElement("button");
    update(node, {}, { class: "a" }, () => node.classList.add("dark"));
    expect(classes(node)).toStrictEqual(["a", "dark"]);
  });

  test.each([{}, { class: false }, { class: undefined }])(
    "removes the client's classes for %o, and the attribute only if none is left",
    (props) => {
      const node = document.createElement("button");
      update(node, { class: "a b" }, props, () => node.classList.add("dark"));
      expect(node.getAttribute("class")).toStrictEqual("dark");

      const own = document.createElement("button");
      update(own, { class: "a b" }, props);
      expect(own.hasAttribute("class")).toStrictEqual(false);
    },
  );

  test("reads class names between any whitespace", () => {
    const node = document.createElement("button");
    update(node, { class: " a\n  b\tc " }, { class: "b" });
    expect(classes(node)).toStrictEqual(["b"]);
  });

  test("leaves a class the client still renders, that was removed", () => {
    const node = document.createElement("button");
    update(node, { class: "a b" }, { class: "a c" }, () => node.classList.remove("a"));
    expect(classes(node)).toStrictEqual(["c"]);
  });

  test("updates the classes of an SVG element", () => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    update(node, { class: "a" }, { class: "b" }, () => node.classList.add("dark"));
    expect(classes(node)).toStrictEqual(["b", "dark"]);
  });

  test("keeps a style property that was added, and changes the client's", () => {
    const node = document.createElement("button");
    update(node, { style: "color: red; margin-top: 1px" }, { style: "color: blue" }, () =>
      node.style.setProperty("filter", "invert(1)"),
    );
    expect(node.style.color).toStrictEqual("blue");
    expect(node.style.marginTop).toStrictEqual("");
    expect(node.style.filter).toStrictEqual("invert(1)");
  });

  test("adds the client's first style to the properties that are there", () => {
    const node = document.createElement("button");
    update(node, {}, { style: "color: red" }, () => node.style.setProperty("filter", "invert(1)"));
    expect(node.style.color).toStrictEqual("red");
    expect(node.style.filter).toStrictEqual("invert(1)");
  });

  test.each([{}, { style: false }])(
    "removes the client's style properties for %o, and the attribute only if none is left",
    (props) => {
      const node = document.createElement("button");
      update(node, { style: "color: red" }, props, () =>
        node.style.setProperty("filter", "invert(1)"),
      );
      expect(node.style.color).toStrictEqual("");
      expect(node.style.filter).toStrictEqual("invert(1)");

      const own = document.createElement("button");
      update(own, { style: "color: red" }, props);
      expect(own.hasAttribute("style")).toStrictEqual(false);
    },
  );

  test("leaves a style property the client didn't change, that was changed", () => {
    const node = document.createElement("button");
    update(node, { style: "color: red; top: 1px" }, { style: "color: red; top: 2px" }, () =>
      node.style.setProperty("color", "green"),
    );
    expect(node.style.color).toStrictEqual("green");
    expect(node.style.top).toStrictEqual("2px");
  });

  test("keeps !important and custom properties", () => {
    const node = document.createElement("button");
    update(node, { style: "color: red" }, { style: "color: blue !important; --gap: 4px" });
    expect(node.style.getPropertyValue("color")).toStrictEqual("blue");
    expect(node.style.getPropertyPriority("color")).toStrictEqual("important");
    expect(node.style.getPropertyValue("--gap")).toStrictEqual("4px");

    update(node, { style: "color: blue !important; --gap: 4px" }, { style: "color: blue" });
    expect(node.style.getPropertyPriority("color")).toStrictEqual("");
    expect(node.style.getPropertyValue("--gap")).toStrictEqual("");
  });

  test.each([
    [{ class: "a b" }, { class: "b c" }],
    [{ class: "a" }, { class: "" }],
    [{ style: "color: red; top: 1px" }, { style: "top: 2px; left: 0px" }],
  ])("from %o to %o is what the server renders, with nothing added", (previous, props) => {
    const node = document.createElement("button");
    update(node, previous, props);
    const server = <HTMLElement>fromServer(props);
    expect(classes(node)).toStrictEqual(classes(server));
    expect(node.hasAttribute("class")).toStrictEqual(server.hasAttribute("class"));
    expect(properties(node)).toStrictEqual(properties(server));
    for (const property of properties(server)) {
      expect(node.style.getPropertyValue(property)).toStrictEqual(
        server.style.getPropertyValue(property),
      );
    }
  });
});
