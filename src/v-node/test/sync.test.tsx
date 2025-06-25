import { assert } from "@std/assert/assert";
import { create, update } from "../sync.ts";
import { isVElement, type VElement, VNodeProps } from "../mod.ts";

Deno.test("Update vNode", async (t) => {
  await t.step("should update appended additional node", () => {
    const list = (
      <ul>
        <li class="item-1" key={1}>1</li>
        <li class="item-2" key={2}>2</li>
        <li class="item-3" key={3}>3</li>
        <li class="item-4" key={4}>4</li>
        <li class="item-5" key={5}>5</li>
      </ul>
    );
    const vNode = create(list) as VElement<unknown>;
    const control = vNode[VNodeProps.CHILDREN];

    const changedList = (
      <ul>
        <li class="item-1" key={1}>1</li>
        <li class="item-2" key={2}>2</li>
        <li class="item-3" key={3}>3</li>
        <li class="item-4" key={4}>4</li>
        <li class="item-5" key={5}>5</li>
        <li class="item-6" key={6}>6</li>
      </ul>
    );
    const updatedVNode = update(changedList, vNode, {});
    assert(updatedVNode === vNode);
    assert(isVElement(vNode));
    assert(isVElement(updatedVNode));
    assert(
      vNode[VNodeProps.CHILDREN]?.[0] ===
        control?.[0],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[1] ===
        control?.[1],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[2] ===
        control?.[2],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[3] ===
        control?.[3],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[4] ===
        control?.[4],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[5] !==
        control?.[5],
      "Not the same VNode",
    );
  });

  await t.step("should update prepended additional node", () => {
    const list = (
      <ul>
        <li class="item-1" key={1}>1</li>
        <li class="item-2" key={2}>2</li>
        <li class="item-3" key={3}>3</li>
        <li class="item-4" key={4}>4</li>
        <li class="item-5" key={5}>5</li>
      </ul>
    );
    const vNode = create(list) as VElement<unknown>;
    const control = vNode[VNodeProps.CHILDREN];

    const changedList = (
      <ul>
        <li class="item-6" key={6}>6</li>
        <li class="item-1" key={1}>1</li>
        <li class="item-2" key={2}>2</li>
        <li class="item-3" key={3}>3</li>
        <li class="item-4" key={4}>4</li>
        <li class="item-5" key={5}>5</li>
      </ul>
    );
    const updatedVNode = update(changedList, vNode, {});
    assert(updatedVNode === vNode);
    assert(isVElement(vNode));
    assert(isVElement(updatedVNode));
    assert(
      vNode[VNodeProps.CHILDREN]?.[0] !== control?.[0],
      "Not the same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[1] === control?.[0],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[1] !== control?.[1],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[2] === control?.[1],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[2] !== control?.[2],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[3] === control?.[2],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[3] !== control?.[3],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[4] === control?.[3],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[4] !== control?.[4],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[5] === control?.[4],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[5] !== control?.[5],
      "The same VNode",
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[6] === control?.[5],
      "The same VNode",
    );
  });

  await t.step("should update prepended additional node without key", () => {
    const list = (
      <ul>
        <li class="item-1" key={1}>1</li>
        <li class="item-2" key={2}>2</li>
        <li class="item-3" key={3}>3</li>
        <li class="item-4" key={4}>4</li>
        <li class="item-5" key={5}>5</li>
      </ul>
    );
    const vNode = create(list) as VElement<unknown>;
    const control = vNode[VNodeProps.CHILDREN];

    const changedList = (
      <ul>
        <li class="item-6">6</li>
        <li class="item-1" key={1}>1</li>
        <li class="item-2" key={2}>2</li>
        <li class="item-3" key={3}>3</li>
        <li class="item-4" key={4}>4</li>
        <li class="item-5" key={5}>5</li>
      </ul>
    );
    const updatedVNode = update(changedList, vNode, {});
    assert(updatedVNode === vNode);
    assert(isVElement(vNode));
    assert(isVElement(updatedVNode));
    assert(
      vNode[VNodeProps.CHILDREN]?.[0] !== control?.[0],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[1] !== control?.[1],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[2] !== control?.[2],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[3] !== control?.[3],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[4] !== control?.[4],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[5] !== control?.[5],
    );
  });

  await t.step("should update prepended additional node without key", () => {
    const list = (
      <ul>
        <li class="item-1" key={1}>1</li>
        <li class="item-2" key={2}>2</li>
        <li class="item-3" key={3}>3</li>
        <li class="item-4" key={4}>4</li>
        <li class="item-5" key={5}>5</li>
      </ul>
    );
    const vNode = create(list) as VElement<unknown>;
    const control = vNode[VNodeProps.CHILDREN];

    const changedList = (
      <ul>
        <li class="item-6">6</li>
        <li class="item-1" key={1}>1</li>
        <li class="item-2" key={2}>2</li>
        <li class="item-3" key={3}>3</li>
        <li class="item-4" key={4}>4</li>
        <li class="item-5" key={5}>5</li>
      </ul>
    );
    const updatedVNode = update(changedList, vNode, {});
    assert(updatedVNode === vNode);
    assert(isVElement(vNode));
    assert(isVElement(updatedVNode));
    assert(
      vNode[VNodeProps.CHILDREN]?.[0] !== control?.[0],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[1] !== control?.[1],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[2] !== control?.[2],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[3] !== control?.[3],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[4] !== control?.[4],
    );
    assert(
      vNode[VNodeProps.CHILDREN]?.[5] !== control?.[5],
    );
  });
});
