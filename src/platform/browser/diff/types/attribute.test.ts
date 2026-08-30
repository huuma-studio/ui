import { assertEquals } from "@std/assert";
import { signal } from "../../../../signal/mod.ts";
import { type VElement, VNodeProps } from "../../../../v-node/mod.ts";
import { Action, Props, Type } from "../dispatch.ts";
import {
  attribute,
  type AttributeChangeSet,
  compareAttributes,
  type CreateAttributeChangeSet,
  setAttribute,
} from "./attribute.ts";

/**
 * Minimal fake HTMLElement recording the attribute operations dispatched
 * by the diff layer, mirroring how browser-diff tests stub DOM nodes.
 */
interface Recorded {
  set: [string, string][];
  remove: string[];
  checked: boolean;
  value: string;
}

function fakeElement(vElement: VElement<Node>): Recorded {
  const recorded: Recorded = {
    set: [],
    remove: [],
    checked: false,
    value: "",
  };
  vElement[VNodeProps.NODE_REF] = <Node> <unknown> {
    setAttribute: (name: string, value: string) => {
      recorded.set.push([name, value]);
    },
    removeAttribute: (name: string) => {
      recorded.remove.push(name);
    },
    get checked() {
      return recorded.checked;
    },
    set checked(value: boolean) {
      recorded.checked = value;
    },
    get value() {
      return recorded.value;
    },
    set value(value: string) {
      recorded.value = value;
    },
  };
  return recorded;
}

function vElementNode(
  props: Record<string, unknown>,
): VElement<Node> {
  return <VElement<Node>> <unknown> {
    type: 1,
    [VNodeProps.TAG]: "button",
    [VNodeProps.PROPS]: props,
    [VNodeProps.EVENT_REFS]: [],
    [VNodeProps.CHILDREN]: [],
  };
}

Deno.test("create attribute changesets", async (t) => {
  await t.step("omit falsy boolean attributes", () => {
    for (const value of [false, ""] as const) {
      const vNode = vElementNode({ disabled: value });
      const recorded = fakeElement(vNode);

      attribute(
        <CreateAttributeChangeSet> {
          [Props.Type]: Type.Attribute,
          [Props.Action]: Action.Create,
          [Props.Payload]: { vNode, name: "disabled", value },
        },
      );

      // No attribute value is ever written verbatim. The cleanup
      // removeAttribute is a no-op on freshly created elements.
      assertEquals(recorded.set, []);
      assertEquals(recorded.remove, ["disabled"]);
    }
  });

  await t.step("emit the bare attribute for truthy boolean values", () => {
    for (const name of ["disabled", "readonly"] as const) {
      const vNode = vElementNode({ [name]: true });
      const recorded = fakeElement(vNode);

      attribute(
        <CreateAttributeChangeSet> {
          [Props.Type]: Type.Attribute,
          [Props.Action]: Action.Create,
          [Props.Payload]: { vNode, name, value: true },
        },
      );

      assertEquals(recorded.set, [[name, ""]]);
      assertEquals(recorded.remove, []);
    }
  });

  await t.step("keep checked IDL behavior for booleans", () => {
    const vNode = vElementNode({ checked: true });
    const recorded = fakeElement(vNode);

    attribute(
      <CreateAttributeChangeSet> {
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Create,
        [Props.Payload]: { vNode, name: "checked", value: true },
      },
    );

    assertEquals(recorded.set, []);
    assertEquals(recorded.checked, true);
  });

  await t.step("leave non-boolean attributes verbatim", () => {
    const vNode = vElementNode({});
    const recorded = fakeElement(vNode);

    attribute(
      <CreateAttributeChangeSet> {
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Create,
        [Props.Payload]: { vNode, name: "class", value: "btn" },
      },
    );
    attribute(
      <CreateAttributeChangeSet> {
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Create,
        [Props.Payload]: { vNode, name: "aria-busy", value: "false" },
      },
    );
    attribute(
      <CreateAttributeChangeSet> {
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Create,
        [Props.Payload]: { vNode, name: "value", value: "text" },
      },
    );

    assertEquals(recorded.set, [
      ["class", "btn"],
      ["aria-busy", "false"],
    ]);
    // The value attribute is written through the IDL property.
    assertEquals(recorded.value, "text");
    assertEquals(recorded.remove, []);
  });
});

Deno.test("compareAttributes boolean attribute transitions", async (t) => {
  await t.step("truthy to falsy removes the attribute", () => {
    const previous = vElementNode({ disabled: true });
    const vNode = vElementNode({ disabled: false });
    const recorded = fakeElement(vNode);

    const changes = compareAttributes(vNode, previous);
    assertEquals(changes.length, 1);
    assertEquals(changes[0][Props.Type], Type.Attribute);
    assertEquals(changes[0][Props.Action], Action.Delete);

    changes.forEach((change) => attribute(change as AttributeChangeSet));
    assertEquals(recorded.remove, ["disabled"]);
    assertEquals(recorded.set, []);
  });

  await t.step("falsy to truthy adds the bare attribute", () => {
    const previous = vElementNode({ disabled: false });
    const vNode = vElementNode({ disabled: true });
    const recorded = fakeElement(vNode);

    const changes = compareAttributes(vNode, previous);
    assertEquals(changes.length, 1);
    assertEquals(changes[0][Props.Type], Type.Attribute);
    assertEquals(changes[0][Props.Action], Action.Create);

    changes.forEach((change) => attribute(change as AttributeChangeSet));
    assertEquals(recorded.set, [["disabled", ""]]);
    assertEquals(recorded.remove, []);
  });

  await t.step("unchanged truthy values produce no changesets", () => {
    const changes = compareAttributes(
      vElementNode({ disabled: true }),
      vElementNode({ disabled: true }),
    );
    assertEquals(changes, []);
  });

  await t.step("boolean attributes dropped from props are deleted", () => {
    const changes = compareAttributes(
      vElementNode({}),
      vElementNode({ disabled: true }),
    );

    const deletes = changes.filter((c) => c[Props.Action] === Action.Delete);
    assertEquals(deletes.length, 1);
    assertEquals(
      (deletes[0][Props.Payload] as { name: string }).name,
      "disabled",
    );
  });

  await t.step("non-boolean attribute transitions stay verbatim", () => {
    const changes = compareAttributes(
      vElementNode({ class: "next" }),
      vElementNode({ class: "previous" }),
    );

    assertEquals(changes.length, 1);
    assertEquals(changes[0][Props.Action], Action.Create);
    assertEquals(
      (changes[0][Props.Payload] as { name: string; value: string }).value,
      "next",
    );
  });
});

Deno.test("media boolean attributes omitted when falsy", () => {
  // Regression: falsy values of omitted standard boolean attributes (e.g.
  // the media restriction attributes) must never be written verbatim.
  for (
    const name of [
      "disablepictureinpicture",
      "disableremoteplayback",
      "allowpaymentrequest",
      "webkitdirectory",
    ] as const
  ) {
    const vNode = vElementNode({ [name]: false });
    const recorded = fakeElement(vNode);

    attribute(
      <CreateAttributeChangeSet> {
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Create,
        [Props.Payload]: { vNode, name, value: false },
      },
    );

    assertEquals(recorded.set, []);
    assertEquals(recorded.remove, [name]);
  }
});

Deno.test("signal-driven disabled flip adds and removes the attribute", () => {
  const busy = signal(true);

  // Initial render with disabled={busy.get()} - control starts disabled.
  const previous = vElementNode({ disabled: busy.get() });
  const initialRecorded = fakeElement(previous);
  for (
    const change of setAttribute(
      "disabled",
      previous[VNodeProps.PROPS].disabled,
      previous,
    )
  ) {
    attribute(change as AttributeChangeSet);
  }
  assertEquals(initialRecorded.set, [["disabled", ""]]);
  assertEquals(initialRecorded.remove, []);

  // Flip to false: the diff must delete the attribute from the DOM.
  busy.set(false);
  const updated = vElementNode({ disabled: busy.get() });
  const updatedRecorded = fakeElement(updated);
  const removals = compareAttributes(updated, previous);
  assertEquals(removals.length, 1);
  assertEquals(removals[0][Props.Action], Action.Delete);
  removals.forEach((change) => attribute(change as AttributeChangeSet));
  assertEquals(updatedRecorded.remove, ["disabled"]);
  assertEquals(updatedRecorded.set, []);

  // Flip back to true: the diff must re-add the bare attribute.
  busy.set(true);
  const reEnabled = vElementNode({ disabled: busy.get() });
  const reEnabledRecorded = fakeElement(reEnabled);
  const reAdds = compareAttributes(reEnabled, updated);
  assertEquals(reAdds.length, 1);
  assertEquals(reAdds[0][Props.Action], Action.Create);
  reAdds.forEach((change) => attribute(change as AttributeChangeSet));
  assertEquals(reEnabledRecorded.set, [["disabled", ""]]);
  assertEquals(reEnabledRecorded.remove, []);
});
