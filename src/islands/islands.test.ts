import { assertEquals } from "@std/assert";

import { type JSX, jsx } from "../jsx-runtime/mod.ts";
import { type Island, markIslands } from "./islands.ts";

Deno.test("markIslands emits island markers without stray whitespace", () => {
  const Island = () => jsx("div", {});
  const islands: Island[] = [];
  const visit = markIslands([{ path: "/island.tsx", island: Island }], islands);

  const result = visit(
    jsx(Island, { children: ["hi"] }),
  ) as JSX.ComponentNode<JSX.Component>;

  assertEquals(islands.length, 1);
  const { id, node } = islands[0];
  const islandNode = node as JSX.ComponentNode<JSX.Component>;

  // The island is wrapped in start/end marker comments. The end marker
  // previously carried a leading space, which the HTML parser turned
  // into a stray whitespace text node leaking into the island's
  // collected hydration stream.
  const fragmentChildren = result.props.children as unknown[];
  const startMarker = fragmentChildren[0] as { templates: string[] };
  const endMarker = fragmentChildren[2] as { templates: string[] };
  assertEquals(startMarker.templates, [`<!-- start_island_${id} -->`]);
  assertEquals(endMarker.templates, [`<!--end_island_${id} -->`]);

  // ...and its children between children markers.
  const wrappedChildren = islandNode.props.children as unknown[];
  assertEquals(wrappedChildren.length, 3);
  assertEquals(
    (wrappedChildren[0] as { templates: string[] }).templates,
    [`<!-- start_children_${id} -->`],
  );
  assertEquals(wrappedChildren[1], "hi");
  assertEquals(
    (wrappedChildren[2] as { templates: string[] }).templates,
    [`<!-- end_children_${id} -->`],
  );
});
