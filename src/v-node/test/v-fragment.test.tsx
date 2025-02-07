import { assertEquals } from "@std/assert/equals";
import { create, VNodeProps, VType } from "../mod.ts";

Deno.test("should create vFragment", () => {
  const text1 = "Hello World";

  const vFragement = create(<>{text1}</>);
  assertEquals(vFragement, {
    type: VType.FRAGMENT,
    [VNodeProps.KEY]: undefined,
    [VNodeProps.CLEANUP]: [],
    [VNodeProps.CHILDREN]: [
      {
        type: VType.TEXT,
        [VNodeProps.TEXT]: text1,
        [VNodeProps.SKIP_ESCAPING]: false,
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
    [VNodeProps.CLEANUP]: [],
    [VNodeProps.CHILDREN]: [
      {
        type: VType.TEXT,
        [VNodeProps.TEXT]: "Hello",
        [VNodeProps.SKIP_ESCAPING]: false,
      },
      {
        type: VType.TEXT,
        [VNodeProps.TEXT]: "World",
        [VNodeProps.SKIP_ESCAPING]: false,
      },
    ],
    [VNodeProps.OPTIONS]: {
      _GLOBAL: {},
    },
  });
});
