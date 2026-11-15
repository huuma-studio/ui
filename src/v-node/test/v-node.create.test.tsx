import { describe, expect, test } from "vite-plus/test";
import { VMode, VNodeProps, VType } from "./../mod.ts";

import { WritableSignal } from "../../signal/mod.ts";
import type { JSX } from "../../jsx-runtime/jsx.ts";
import { create } from "../sync.ts";

function ComponentA({ children }: JSX.ComponentProps) {
  return <div class="text-blue">{["", children]}</div>;
}

describe(create.name, () => {
  test("should create VText Node", () => {
    const vText = create("Hello");
    expect(vText).toStrictEqual({
      type: VType.TEXT,
      [VNodeProps.TEXT]: "Hello",
      [VNodeProps.SKIP_ESCAPING]: false,
      [VNodeProps.CLEANUP]: [],
    });

    const vNumber = create(0);
    expect(vNumber).toStrictEqual({
      type: VType.TEXT,
      [VNodeProps.TEXT]: "0",
      [VNodeProps.SKIP_ESCAPING]: false,
      [VNodeProps.CLEANUP]: [],
    });

    const signal = new WritableSignal("Signal");
    const vSignal = create(signal);
    expect(vSignal).toStrictEqual({
      type: 0,
      [VNodeProps.TEXT]: signal,
      [VNodeProps.SKIP_ESCAPING]: false,
      [VNodeProps.CLEANUP]: [],
    });
  });

  test("should return null", () => {
    const nullVNode = create(null);
    expect(nullVNode).toStrictEqual(null);

    const trueVNode = create(true);
    expect(trueVNode).toStrictEqual(null);

    const falseVNode = create(false);
    expect(falseVNode).toStrictEqual(null);

    const undefinedVNode = create(undefined);
    expect(undefinedVNode).toStrictEqual(null);
  });

  test("should create vElement", () => {
    const text1 = "Hello World";

    const vElement = create(<div class="nice">{text1}</div>);
    expect(vElement).toStrictEqual({
      type: VType.ELEMENT,
      [VNodeProps.TAG]: "div",
      [VNodeProps.KEY]: undefined,
      [VNodeProps.BIND]: undefined,
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

  test("should create VComponent", () => {
    const vComponent = create(<ComponentA>Hello World!</ComponentA>);
    expect(vComponent).toStrictEqual({
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
        [VNodeProps.BIND]: undefined,
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
