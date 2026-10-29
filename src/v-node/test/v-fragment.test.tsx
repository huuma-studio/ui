import { expect, test } from "vite-plus/test";
import { create } from "../sync.ts";
import { create as createAsync } from "../async.ts";
import { type VNode, VNodeProps, VType } from "../mod.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";

test("should create vFragment", () => {
  const text1 = "Hello World";

  const vFragement = create(<>{text1}</>);
  expect(vFragement).toStrictEqual({
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
  expect(vFragmentArrayLike).toStrictEqual({
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

test("should not consume TemplateNode nodes on create", () => {
  const templateNode: JSX.TemplateNode = {
    templates: ["<div>", "</div>"],
    nodes: ["Hello"],
  };

  const vFragmentFromTemplate = create(templateNode);

  // Creating from a TemplateNode must not consume its nodes -
  // a second create from the same input yields the same result.
  expect(templateNode.nodes).toStrictEqual(["Hello"]);
  expect(create(templateNode)).toStrictEqual(vFragmentFromTemplate);
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

test("should create vFragment from a TemplateNode without nodes", () => {
  expect(create(templateNodeWithoutNodes)).toStrictEqual(expectedVFragmentWithoutNodes);
});

test("should create async vFragment from a TemplateNode without nodes", async () => {
  expect(await createAsync(templateNodeWithoutNodes, {})).toStrictEqual(
    expectedVFragmentWithoutNodes,
  );
});
