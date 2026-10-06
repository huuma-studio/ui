import { assertEquals } from "@std/assert";

import { type JSX, jsx } from "../../../jsx-runtime/mod.ts";
import { signal } from "../../../signal/mod.ts";
import { VNodeProps } from "../../../v-node/mod.ts";
import { create } from "../../../v-node/sync.ts";
import { AttachmentType, type ParentAttachmentRef } from "./attachment-ref.ts";
import { Action, Props, Type } from "./dispatch.ts";
import { hydrate } from "./hydrate.ts";
import type { ReplaceTextPayload } from "./types/text.ts";

/*
 * Minimal DOM stand-ins. While computing change sets, hydrate() only
 * reads nodeName, nodeType, childNodes and textContent; the dispatch
 * handlers (which need a real DOM) are never run here.
 */
class FakeText {
  nodeType = 3;

  constructor(public textContent: string) {}
}

// hydrate() links consumed text nodes via `instanceof Text`, which only
// exists in the browser. Shim it for the test runtime.
if (typeof globalThis.Text === "undefined") {
  (globalThis as { Text: unknown }).Text = FakeText;
}

const elementNode = (nodeName: string, childNodes: Node[] = []): Node =>
  ({ nodeName, nodeType: 1, childNodes }) as unknown as Node;

const textNode = (textContent: string): Node =>
  new FakeText(textContent) as unknown as Node;

const parentAttachmentRef = (node: Node): ParentAttachmentRef => ({
  type: AttachmentType.Parent,
  vNode: { [VNodeProps.NODE_REF]: node },
});

Deno.test("hydrate keeps the node stream aligned across an empty text child", () => {
  // Island root: <div>["", <section>list 1</section>, <section>list 2</section>]</div>
  // The HTML parser drops the empty text node (a "" child from a falsy
  // guard like `{error && <p/>}`), so the DOM only holds the two lists.
  const section1 = elementNode("section");
  const section2 = elementNode("section");
  const div = elementNode("div", [section1, section2]);

  const vNode = create<Node>(
    jsx("div", {
      class: "flex",
      children: [
        "",
        jsx("section", { children: ["list 1"] }),
        jsx("section", { children: ["list 2"] }),
      ],
    }),
  );

  const changeSets = hydrate(vNode, [div], parentAttachmentRef(div));

  // Every element must be linked to its own DOM node, in order. Without
  // the fix the empty text consumed section1 and list 1 hydrated into
  // list 2's DOM.
  const links = changeSets
    .filter((changeSet) =>
      changeSet[Props.Type] === Type.Element &&
      changeSet[Props.Action] === Action.Link
    )
    .map((changeSet) => (changeSet[Props.Payload] as { node: Node }).node);
  assertEquals(links, [div, section1, section2]);

  // No text replacement may hijack an element node.
  const replacedTexts = changeSets.filter((changeSet) =>
    changeSet[Props.Type] === Type.Text &&
    changeSet[Props.Action] === Action.Replace
  );
  assertEquals(replacedTexts.length, 0);
});

Deno.test("hydrate skips island marker comments left in the node stream", () => {
  const marker = {
    nodeName: "#comment",
    nodeType: 8,
    textContent: "start_island_abc123",
  } as unknown as Node;
  const section = elementNode("section");
  const div = elementNode("div", [marker, section]);

  const vNode = create<Node>(
    jsx("div", {
      children: [jsx("section", { children: ["list"] })],
    }),
  );

  const changeSets = hydrate(vNode, [div], parentAttachmentRef(div));

  const links = changeSets
    .filter((changeSet) =>
      changeSet[Props.Type] === Type.Element &&
      changeSet[Props.Action] === Action.Link
    )
    .map((changeSet) => (changeSet[Props.Payload] as { node: Node }).node);
  assertEquals(links, [div, section]);
});

Deno.test("hydrate structurally replaces a server element for nonempty diverged text", () => {
  // Server: <div><span>server</span><button>next</button></div>
  // Client: <div>["client", <button>next</button>]</div>
  // The content diverged between the renders - the nonempty text must
  // consume and replace the span. Leaving it behind would make the
  // client button replace the span instead, leaving the server's button
  // visible and untracked (duplicate content).
  const span = elementNode("span");
  const button = elementNode("button");
  const div = elementNode("div", [span, button]);

  const vNode = create<Node>(
    jsx("div", {
      children: ["client", jsx("button", {})],
    }),
  );

  const changeSets = hydrate(vNode, [div], parentAttachmentRef(div));

  const replacedTexts = changeSets.filter((changeSet) =>
    changeSet[Props.Type] === Type.Text &&
    changeSet[Props.Action] === Action.Replace
  );
  assertEquals(replacedTexts.length, 1);
  assertEquals(
    (replacedTexts[0][Props.Payload] as ReplaceTextPayload)
      .vText[VNodeProps.NODE_REF],
    span,
  );

  const links = changeSets
    .filter((changeSet) =>
      changeSet[Props.Type] === Type.Element &&
      changeSet[Props.Action] === Action.Link
    )
    .map((changeSet) => (changeSet[Props.Payload] as { node: Node }).node);
  assertEquals(links, [div, button]);
});

Deno.test("hydrate leaves a server element for an empty signal text", () => {
  // A signal-bound text child with value "" - the parser dropped the
  // text node, so the following element belongs to the next sibling.
  const section = elementNode("section");
  const div = elementNode("div", [section]);

  const emptySignal = signal("") as unknown as JSX.SignalLike;

  const vNode = create<Node>(
    jsx("div", {
      children: [emptySignal, jsx("section", {})],
    }),
  );

  const changeSets = hydrate(vNode, [div], parentAttachmentRef(div));

  const links = changeSets
    .filter((changeSet) =>
      changeSet[Props.Type] === Type.Element &&
      changeSet[Props.Action] === Action.Link
    )
    .map((changeSet) => (changeSet[Props.Payload] as { node: Node }).node);
  assertEquals(links, [div, section]);
  assertEquals(
    changeSets.filter((changeSet) => changeSet[Props.Action] === Action.Replace)
      .length,
    0,
  );
});

Deno.test("hydrate links a text child to its DOM text node", () => {
  const text = textNode("hello");
  const p = elementNode("p");
  const div = elementNode("div", [text, p]);

  const vNode = create<Node>(
    jsx("div", {
      children: ["hello", jsx("p", {})],
    }),
  );

  const changeSets = hydrate(vNode, [div], parentAttachmentRef(div));

  const textLinks = changeSets.filter((changeSet) =>
    changeSet[Props.Type] === Type.Text &&
    changeSet[Props.Action] === Action.Link
  );
  assertEquals(textLinks.length, 1);
  assertEquals(
    (textLinks[0][Props.Payload] as { node: Node }).node,
    text,
  );
});
