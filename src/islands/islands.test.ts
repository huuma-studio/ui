import { expect, test } from "vite-plus/test";

import { type JSX, jsx } from "../jsx-runtime/mod.ts";
import { type Island, markIslands } from "./islands.ts";

test("markIslands emits island markers without stray whitespace", () => {
  const Island = () => jsx("div", {});
  const islands: Island[] = [];
  const visit = markIslands([{ path: "/island.tsx", island: Island }], islands);

  const result = visit(jsx(Island, { children: ["hi"] })) as JSX.ComponentNode<JSX.Component>;

  expect(islands.length).toStrictEqual(1);
  const { id, node } = islands[0];
  const islandNode = node as JSX.ComponentNode<JSX.Component>;

  // The island is wrapped in start/end marker comments. The end marker
  // previously carried a leading space, which the HTML parser turned
  // into a stray whitespace text node leaking into the island's
  // collected hydration stream.
  const fragmentChildren = result.props.children as unknown[];
  const startMarker = fragmentChildren[0] as { templates: string[] };
  const endMarker = fragmentChildren[2] as { templates: string[] };
  expect(startMarker.templates).toStrictEqual([`<!-- start_island_${id} -->`]);
  expect(endMarker.templates).toStrictEqual([`<!--end_island_${id} -->`]);

  // ...and its children between children markers.
  const wrappedChildren = islandNode.props.children as unknown[];
  expect(wrappedChildren.length).toStrictEqual(3);
  expect((wrappedChildren[0] as { templates: string[] }).templates).toStrictEqual([
    `<!-- start_children_${id} -->`,
  ]);
  expect(wrappedChildren[1]).toStrictEqual("hi");
  expect((wrappedChildren[2] as { templates: string[] }).templates).toStrictEqual([
    `<!-- end_children_${id} -->`,
  ]);
});
