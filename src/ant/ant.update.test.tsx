import { assertEquals, assert } from "@std/assert/mod.ts";
import { vText, update, VNodeProps, vElement } from "./ant.ts";

Deno.test(update.name, async (t) => {
  await t.step("update VText", () => {
    const vNode = vText("Hello World");
    const updatedVNode = update("Hello Univers", vNode, { $: [] });

    // Check if its in the right shape
    assertEquals(vNode, {
      type: 0,
      [VNodeProps.TEXT]: "Hello Univers",
    });

    //Check if its the same object
    assert(vNode === updatedVNode);
  });

  await t.step("update VElement", () => {
    const vNode = vElement((<div>Hello World</div>) as JSX.Element<string>, {
      $: [],
    });

    const clickListener = () => {};

    const updateVElement = update(
      <div on-click={clickListener}>Hello Univers</div>,
      vNode,
      { $: [] },
    );

    assertEquals(updateVElement, {
      type: 1,
      [VNodeProps.TAG]: "div",
      [VNodeProps.PROPS]: { children: ["Hello Univers"] },
      [VNodeProps.CHILDREN]: [{ type: 0, [VNodeProps.TEXT]: "Hello Univers" }],
      [VNodeProps.EVENT_REFS]: [
        {
          listener: clickListener,
          name: "click",
        },
      ],
      [VNodeProps.OPTIONS]: { _GLOBAL: { $: [] } },
      [VNodeProps.CLEANUP]: [],
    });

    //Check if its the same object
    assert(vNode === updateVElement);
  });
});
