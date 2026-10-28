import { expect, test } from "vite-plus/test";

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

const textNode = (textContent: string): Node => ({ nodeType: 3, textContent }) as unknown as Node;

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

test("createChild materializes sibling islands inside an element", () => {
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

  expect(result.type).toStrictEqual("div");
  const children = result.props.children as JSX.Element[];
  // Both sibling islands must be materialized. Previously the island
  // children stream collected the wrapper element itself, so B's
  // materialization walked the whole wrapper subtree and C was silently
  // stripped from the islands list - dead, never hydrated.
  expect(children.length).toStrictEqual(2);
  expect((children[0] as JSX.ComponentNode<JSX.Component>).type).toStrictEqual(IslandB);
  expect((children[1] as JSX.ComponentNode<JSX.Component>).type).toStrictEqual(IslandC);
});

test("createChild hands the island its own content nodes", () => {
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

  expect(result.type).toStrictEqual("div");
  const children = result.props.children as JSX.Element[];
  expect(children.length).toStrictEqual(3);
  expect(children[0]).toStrictEqual("before");
  expect((children[1] as JSX.ComponentNode<JSX.Component>).type).toStrictEqual(IslandB);
  // The island's children stream is divB itself, not the wrapper.
  const islandProps = (children[1] as JSX.ComponentNode<JSX.Component>).props;
  const islandChildren = islandProps.children as JSX.Element[];
  expect(islandChildren.length).toStrictEqual(0);
  expect(children[2]).toStrictEqual("after");
});

test("findIslandChildren materializes a nested island between children markers", () => {
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

  expect(children.length).toStrictEqual(1);
  const island = children[0] as JSX.ComponentNode<JSX.Component>;
  expect(island.type).toStrictEqual(IslandB);
  expect(island.props.children).toStrictEqual(["hello"]);
});

test("createChild rebuilds plain elements and text", () => {
  const span = elementNode("span", [textNode("own")], { class: "x" });
  const wrapper = elementNode("div", [span, textNode("tail")], {
    class: "wrap",
  });

  const result = createChild(wrapper, []) as JSX.ComponentNode<string>;

  expect(result.type).toStrictEqual("div");
  expect(result.props.class).toStrictEqual("wrap");
  const children = result.props.children as JSX.Element[];
  expect(children.length).toStrictEqual(2);
  const spanResult = children[0] as JSX.ComponentNode<string>;
  expect(spanResult.type).toStrictEqual("span");
  expect(spanResult.props.class).toStrictEqual("x");
  expect((spanResult.props.children as unknown[])[0]).toStrictEqual("own");
  expect(children[1]).toStrictEqual("tail");
});
