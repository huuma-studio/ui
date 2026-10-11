import { assertEquals } from "@std/assert";

import { type JSX, jsx } from "../../jsx-runtime/mod.ts";
import { createChild, findIslandChildren } from "./mod.ts";

/*
 * Minimal DOM stand-ins. findIslandChildren()/createChild() only read
 * nodeType, nodeName, textContent, childNodes, getAttributeNames() and
 * getAttribute() while rebuilding the island tree from the server HTML;
 * no real DOM is needed.
 */
const commentNode = (textContent: string): Node =>
  ({ nodeType: 8, textContent }) as unknown as Node;

const textNode = (textContent: string): Node =>
  ({ nodeType: 3, textContent }) as unknown as Node;

const elementNode = (
  nodeName: string,
  childNodes: Node[] = [],
  attributes: Record<string, string> = {},
): Node =>
  ({
    nodeType: 1,
    nodeName,
    childNodes,
    textContent: "",
    getAttributeNames: () => Object.keys(attributes),
    getAttribute: (name: string) => attributes[name] ?? null,
  }) as unknown as Node;

Deno.test("createChild materializes sibling islands inside an element", () => {
  const IslandB = () => jsx("div", { class: "island-b" });
  const IslandC = () => jsx("div", { class: "island-c" });
  const islands = [
    { islandId: "bid123", fn: IslandB, props: {} },
    { islandId: "cid456", fn: IslandC, props: {} },
  ];

  const divB = elementNode("div", [], { class: "island-b" });
  const divC = elementNode("div", [], { class: "island-c" });
  const wrapper = elementNode("div", [
    commentNode("start_island_bid123"),
    divB,
    commentNode("end_island_bid123"),
    commentNode("start_island_cid456"),
    divC,
    commentNode("end_island_cid456"),
  ]);

  const result = createChild(wrapper, islands) as JSX.ComponentNode<string>;

  assertEquals(result.type, "div");
  const children = result.props.children as JSX.Element[];
  // Both sibling islands must be materialized. Previously the island
  // children stream collected the wrapper element itself, so B's
  // materialization walked the whole wrapper subtree and C was silently
  // stripped from the islands list - dead, never hydrated.
  assertEquals(children.length, 2);
  assertEquals((children[0] as JSX.ComponentNode<JSX.Component>).type, IslandB);
  assertEquals((children[1] as JSX.ComponentNode<JSX.Component>).type, IslandC);
});

Deno.test("createChild hands the island its own content nodes", () => {
  const IslandB = () => jsx("div", { class: "island-b" });
  const islands = [{ islandId: "bid123", fn: IslandB, props: {} }];

  const divB = elementNode("div", [], { class: "island-b" });
  const wrapper = elementNode("div", [
    textNode("before"),
    commentNode("start_island_bid123"),
    divB,
    commentNode("end_island_bid123"),
    textNode("after"),
  ]);

  const result = createChild(wrapper, islands) as JSX.ComponentNode<string>;

  assertEquals(result.type, "div");
  const children = result.props.children as JSX.Element[];
  assertEquals(children.length, 3);
  assertEquals(children[0], "before");
  assertEquals((children[1] as JSX.ComponentNode<JSX.Component>).type, IslandB);
  // The island's children stream is divB itself, not the wrapper.
  const islandProps = (children[1] as JSX.ComponentNode<JSX.Component>)
    .props;
  const islandChildren = islandProps.children as JSX.Element[];
  assertEquals(islandChildren.length, 0);
  assertEquals(children[2], "after");
});

Deno.test("findIslandChildren materializes a nested island between children markers", () => {
  const IslandB = () => jsx("div", { class: "island-b" });
  const islands = [{ islandId: "bid123", fn: IslandB, props: {} }];

  const divB = elementNode("div", [
    commentNode("start_children_bid123"),
    textNode("hello"),
    commentNode("end_children_bid123"),
  ]);

  const nodes = [
    commentNode("start_children_aid789"),
    commentNode("start_island_bid123"),
    divB,
    commentNode("end_island_bid123"),
    commentNode("end_children_aid789"),
  ];

  const children = findIslandChildren({
    islandId: "aid789",
    islands,
    nodes,
  });

  assertEquals(children.length, 1);
  const island = children[0] as JSX.ComponentNode<JSX.Component>;
  assertEquals(island.type, IslandB);
  assertEquals(island.props.children, ["hello"]);
});

Deno.test("createChild rebuilds plain elements and text", () => {
  const span = elementNode("span", [textNode("own")], { class: "x" });
  const wrapper = elementNode("div", [span, textNode("tail")], {
    class: "wrap",
  });

  const result = createChild(wrapper, []) as JSX.ComponentNode<string>;

  assertEquals(result.type, "div");
  assertEquals(result.props.class, "wrap");
  const children = result.props.children as JSX.Element[];
  assertEquals(children.length, 2);
  const spanResult = children[0] as JSX.ComponentNode<string>;
  assertEquals(spanResult.type, "span");
  assertEquals(spanResult.props.class, "x");
  assertEquals(
    (spanResult.props.children as unknown[])[0],
    "own",
  );
  assertEquals(children[1], "tail");
});
