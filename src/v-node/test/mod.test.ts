import { assert, expect, test } from "vite-plus/test";
import { isVSignal, keyFromNode } from "../mod.ts";
import { computed, signal } from "../../signal/mod.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";

test(isVSignal.name, () => {
  assert(isVSignal(signal("value") as JSX.Element));
  assert(isVSignal(computed(() => "value") as JSX.Element));

  // Objects that merely have a get member are not signals.
  assert(!isVSignal(new Map() as unknown as JSX.Element));
  assert(!isVSignal({ get: () => "value" } as unknown as JSX.Element));

  assert(!isVSignal("text"));
  assert(!isVSignal(0));
  assert(!isVSignal(null));
  assert(!isVSignal(undefined));
});

test(keyFromNode.name, () => {
  const templateNode: JSX.TemplateNode = {
    templates: ["<div>", "</div>"],
    nodes: ["Hello"],
  };
  expect(keyFromNode(templateNode)).toStrictEqual(undefined);
  expect(keyFromNode([])).toStrictEqual(undefined);
  expect(keyFromNode(<JSX.Element>{ type: "div", key: 1 })).toStrictEqual(1);
});
