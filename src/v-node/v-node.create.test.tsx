import { assertEquals } from "@std/assert/equals";
import { create, VMode, VNodeProps } from "./mod.ts";
import { $ } from "../hooks/state.ts";
import { State } from "../state/mod.ts";
import type { JSX } from "../jsx-runtime/jsx.ts";

Deno.test(create.name, async (t) => {
  await t.step("should create VText Node", () => {
    const vText = create("Hello");
    assertEquals(vText, {
      type: 0,
      [VNodeProps.TEXT]: "Hello",
    });

    const vNumber = create(0);
    assertEquals(vNumber, {
      type: 0,
      [VNodeProps.TEXT]: "0",
    });
  });

  await t.step("should return null", () => {
    const nullVNode = create(null);
    assertEquals(nullVNode, null);

    const trueVNode = create(null);
    assertEquals(trueVNode, null);

    const falseVNode = create(null);
    assertEquals(falseVNode, null);
  });

  await t.step("should return undefined", () => {
    const undefinedVNode = create(undefined);
    assertEquals(undefinedVNode, undefined);
  });

  await t.step("should create vElement", () => {
    const text1 = "Hello World";

    const vElement = create(<div class="nice">{text1}</div>);
    assertEquals(vElement, {
      type: 1,
      [VNodeProps.TAG]: "div",
      [VNodeProps.KEY]: undefined,
      [VNodeProps.PROPS]: {
        children: [text1],
        class: "nice",
      },
      [VNodeProps.EVENT_REFS]: [],
      [VNodeProps.CHILDREN]: [
        {
          type: 0,
          [VNodeProps.TEXT]: text1,
        },
      ],
      [VNodeProps.CLEANUP]: [],
      [VNodeProps.OPTIONS]: {
        _GLOBAL: {},
      },
    });
  });

  await t.step("should create vFragment", () => {
    const text1 = "Hello World";

    const vFragement = create(<>{text1}</>);
    assertEquals(vFragement, {
      type: 3,
      [VNodeProps.KEY]: undefined,
      [VNodeProps.CLEANUP]: [],
      [VNodeProps.CHILDREN]: [
        {
          type: 0,
          [VNodeProps.TEXT]: text1,
        },
      ],
      [VNodeProps.OPTIONS]: {
        _GLOBAL: {},
      },
    });

    const vFragementArrayLike = create(["Hello", "World"]);
    assertEquals(vFragementArrayLike, {
      type: 3,
      [VNodeProps.CLEANUP]: [],
      "4": [
        {
          type: 0,
          [VNodeProps.TEXT]: "Hello",
        },
        {
          type: 0,
          [VNodeProps.TEXT]: "World",
        },
      ],
      [VNodeProps.OPTIONS]: {
        _GLOBAL: {},
      },
    });
  });

  await t.step("should create VComponent", () => {
    const vComponent = create(<ComponentA>Hello World!</ComponentA>);
    assertEquals(vComponent, {
      type: 2,
      [VNodeProps.FN]: ComponentA,
      [VNodeProps.PROPS]: {
        children: ["Hello World!"],
      },
      [VNodeProps.MODE]: VMode.Created,
      [VNodeProps.AST]: {
        [VNodeProps.EVENT_REFS]: [],
        [VNodeProps.CHILDREN]: [
          {
            type: 0,
            [VNodeProps.TEXT]: new State(""),
          },
          {
            type: 3,
            [VNodeProps.CLEANUP]: [],
            [VNodeProps.CHILDREN]: [
              {
                type: 0,
                [VNodeProps.TEXT]: "Hello World!",
              },
            ],
            [VNodeProps.OPTIONS]: {
              _GLOBAL: {},
            },
          },
        ],
        [VNodeProps.TAG]: "div",
        type: 1,
        [VNodeProps.PROPS]: {
          class: "text-blue",
          children: [new State(""), ["Hello World!"]],
        },
        [VNodeProps.CLEANUP]: [],
        [VNodeProps.OPTIONS]: {
          _GLOBAL: {},
        },
      },
      [VNodeProps.OPTIONS]: {
        $: [new State(undefined)],
        _GLOBAL: {},
      },
      [VNodeProps.CLEANUP]: [],
    });
  });
});

function ComponentA({ children }: JSX.ElementProps) {
  const a = $("component a");
  return <div class="text-blue">{[a, children]}</div>;
}
