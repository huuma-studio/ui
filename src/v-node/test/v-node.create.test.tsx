import { assertEquals } from "@std/assert/equals";
import { VMode, VNodeProps, VType } from "./../mod.ts";

import { WritableSignal } from "../../signal/mod.ts";
import type { JSX } from "../../jsx-runtime/jsx.ts";
import { create } from "../sync.ts";

function ComponentA({ children }: JSX.ComponentProps) {
  return <div class="text-blue">{["", children]}</div>;
}

Deno.test(create.name, async (t) => {
  await t.step("should create VText Node", () => {
    const vText = create("Hello");
    assertEquals(vText, {
      type: VType.TEXT,
      [VNodeProps.TEXT]: "Hello",
      [VNodeProps.SKIP_ESCAPING]: false,
      [VNodeProps.CLEANUP]: [],
    });

    const vNumber = create(0);
    assertEquals(vNumber, {
      type: VType.TEXT,
      [VNodeProps.TEXT]: "0",
      [VNodeProps.SKIP_ESCAPING]: false,
      [VNodeProps.CLEANUP]: [],
    });

    const signal = new WritableSignal("Signal");
    const vSignal = create(signal);
    assertEquals(vSignal, {
      type: 0,
      [VNodeProps.TEXT]: signal,
      [VNodeProps.SKIP_ESCAPING]: false,
      [VNodeProps.CLEANUP]: [],
    });
  });

  await t.step("should return null", () => {
    const nullVNode = create(null);
    assertEquals(nullVNode, null);

    const trueVNode = create(true);
    assertEquals(trueVNode, null);

    const falseVNode = create(false);
    assertEquals(falseVNode, null);

    const undefinedVNode = create(undefined);
    assertEquals(undefinedVNode, null);
  });

  await t.step("should create vElement", () => {
    const text1 = "Hello World";

    const vElement = create(<div class="nice">{text1}</div>);
    assertEquals(vElement, {
      type: VType.ELEMENT,
      [VNodeProps.TAG]: "div",
      [VNodeProps.KEY]: undefined,
      [VNodeProps.PROPS]: {
        children: [text1],
        class: "nice",
      },
      [VNodeProps.EVENT_REFS]: [],
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
  });

  await t.step("should create VComponent", () => {
    const vComponent = create(
      <ComponentA>Hello World!</ComponentA>,
    );
    assertEquals(vComponent, {
      type: VType.COMPONENT,
      [VNodeProps.FN]: ComponentA,
      [VNodeProps.KEY]: undefined,
      [VNodeProps.PROPS]: {
        children: ["Hello World!"],
      },
      [VNodeProps.MODE]: VMode.Created,
      [VNodeProps.AST]: {
        type: VType.ELEMENT,
        [VNodeProps.TAG]: "div",
        [VNodeProps.KEY]: undefined,
        [VNodeProps.EVENT_REFS]: [],
        [VNodeProps.CHILDREN]: [
          {
            type: VType.TEXT,
            [VNodeProps.TEXT]: "",
            [VNodeProps.SKIP_ESCAPING]: false,
            [VNodeProps.CLEANUP]: [],
          },
          {
            type: VType.FRAGMENT,
            [VNodeProps.KEY]: undefined,
            [VNodeProps.CHILDREN]: [
              {
                type: VType.TEXT,
                [VNodeProps.TEXT]: "Hello World!",
                [VNodeProps.SKIP_ESCAPING]: false,
                [VNodeProps.CLEANUP]: [],
              },
            ],
            [VNodeProps.OPTIONS]: {
              _GLOBAL: {},
            },
          },
        ],

        [VNodeProps.PROPS]: {
          class: "text-blue",
          children: ["", ["Hello World!"]],
        },
        [VNodeProps.OPTIONS]: {
          _GLOBAL: {},
        },
      },
      [VNodeProps.OPTIONS]: {
        _GLOBAL: {},
      },
      [VNodeProps.CLEANUP]: [],
    });
  });
});
