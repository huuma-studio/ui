import { assertEquals } from "@std/assert/equals";
import { create } from "../sync.ts";
import { create as createAsync } from "../async.ts";
import { type VNode, VNodeProps, VType } from "../mod.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";

Deno.test("should create vFragment", () => {
  const text1 = "Hello World";

  const vFragement = create(<>{text1}</>);
  assertEquals(vFragement, {
    type: VType.FRAGMENT,
    [VNodeProps.KEY]: undefined,
    [VNodeProps.CHILDREN]: [
      {
        type: VType.TEXT,
        [VNodeProps.TEXT]: text1,
        [VNodeProps.SKIP_ESCAPING]: false,
        [VNodeProps.CLEANUP]: [],
      },
    ],
    [VNodeProps.OPTIONS]: {
      _GLOBAL: {},
    },
  });

  const vFragmentArrayLike = create(["Hello", "World"]);
  assertEquals(vFragmentArrayLike, {
    type: VType.FRAGMENT,
    [VNodeProps.KEY]: undefined,
    [VNodeProps.CHILDREN]: [
      {
        type: VType.TEXT,
        [VNodeProps.TEXT]: "Hello",
        [VNodeProps.SKIP_ESCAPING]: false,
        [VNodeProps.CLEANUP]: [],
      },
      {
        type: VType.TEXT,
        [VNodeProps.TEXT]: "World",
        [VNodeProps.SKIP_ESCAPING]: false,
        [VNodeProps.CLEANUP]: [],
      },
    ],
    [VNodeProps.OPTIONS]: {
      _GLOBAL: {},
    },
  });
});

Deno.test("should not consume TemplateNode nodes on create", () => {
  const templateNode: JSX.TemplateNode = {
    templates: ["<div>", "</div>"],
    nodes: ["Hello"],
  };

  const vFragmentFromTemplate = create(templateNode);

  // Creating from a TemplateNode must not consume its nodes -
  // a second create from the same input yields the same result.
  assertEquals(templateNode.nodes, ["Hello"]);
  assertEquals(create(templateNode), vFragmentFromTemplate);
});

// isTemplateNode only requires `templates`, so untyped callers can pass
// a TemplateNode without `nodes`.
const templateNodeWithoutNodes = { templates: ["<hr/>"] } as JSX.TemplateNode;

const expectedVFragmentWithoutNodes: VNode<unknown> = {
  type: VType.FRAGMENT,
  [VNodeProps.KEY]: undefined,
  [VNodeProps.CHILDREN]: [
    {
      type: VType.TEXT,
      [VNodeProps.TEXT]: "<hr/>",
      [VNodeProps.SKIP_ESCAPING]: true,
      [VNodeProps.CLEANUP]: [],
    },
    null,
  ],
  [VNodeProps.OPTIONS]: {
    _GLOBAL: {},
  },
};

Deno.test("should create vFragment from a TemplateNode without nodes", () => {
  assertEquals(
    create(templateNodeWithoutNodes),
    expectedVFragmentWithoutNodes,
  );
});

Deno.test(
  "should create async vFragment from a TemplateNode without nodes",
  async () => {
    assertEquals(
      await createAsync(templateNodeWithoutNodes, {}),
      expectedVFragmentWithoutNodes,
    );
  },
);
