import { describe, expect, test } from "vite-plus/test";
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
  vElement[VNodeProps.NODE_REF] = <Node>(<unknown>{
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
  });
  return recorded;
}

function vElementNode(props: Record<string, unknown>): VElement<Node> {
  return <VElement<Node>>(<unknown>{
    type: 1,
    [VNodeProps.TAG]: "button",
    [VNodeProps.PROPS]: props,
    [VNodeProps.EVENT_REFS]: [],
    [VNodeProps.CHILDREN]: [],
  });
}

describe("create attribute changesets", () => {
  test("omit falsy boolean attributes", () => {
    for (const value of [false, ""] as const) {
      const vNode = vElementNode({ disabled: value });
      const recorded = fakeElement(vNode);

      attribute(<CreateAttributeChangeSet>{
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Create,
        [Props.Payload]: { vNode, name: "disabled", value },
      });

      // No attribute value is ever written verbatim. The cleanup
      // removeAttribute is a no-op on freshly created elements.
      expect(recorded.set).toStrictEqual([]);
      expect(recorded.remove).toStrictEqual(["disabled"]);
    }
  });

  test("emit the bare attribute for truthy boolean values", () => {
    for (const name of ["disabled", "readonly"] as const) {
      const vNode = vElementNode({ [name]: true });
      const recorded = fakeElement(vNode);

      attribute(<CreateAttributeChangeSet>{
        [Props.Type]: Type.Attribute,
        [Props.Action]: Action.Create,
        [Props.Payload]: { vNode, name, value: true },
      });

      expect(recorded.set).toStrictEqual([[name, ""]]);
      expect(recorded.remove).toStrictEqual([]);
    }
  });

  test("keep checked IDL behavior for booleans", () => {
    const vNode = vElementNode({ checked: true });
    const recorded = fakeElement(vNode);

    attribute(<CreateAttributeChangeSet>{
      [Props.Type]: Type.Attribute,
      [Props.Action]: Action.Create,
      [Props.Payload]: { vNode, name: "checked", value: true },
    });

    expect(recorded.set).toStrictEqual([]);
    expect(recorded.checked).toStrictEqual(true);
  });

  test("leave non-boolean attributes verbatim", () => {
    const vNode = vElementNode({});
    const recorded = fakeElement(vNode);

    attribute(<CreateAttributeChangeSet>{
      [Props.Type]: Type.Attribute,
      [Props.Action]: Action.Create,
      [Props.Payload]: { vNode, name: "class", value: "btn" },
    });
    attribute(<CreateAttributeChangeSet>{
      [Props.Type]: Type.Attribute,
      [Props.Action]: Action.Create,
      [Props.Payload]: { vNode, name: "aria-busy", value: "false" },
    });
    attribute(<CreateAttributeChangeSet>{
      [Props.Type]: Type.Attribute,
      [Props.Action]: Action.Create,
      [Props.Payload]: { vNode, name: "value", value: "text" },
    });

    expect(recorded.set).toStrictEqual([
      ["class", "btn"],
      ["aria-busy", "false"],
    ]);
    // The value attribute is written through the IDL property.
    expect(recorded.value).toStrictEqual("text");
    expect(recorded.remove).toStrictEqual([]);
  });
});

describe("compareAttributes boolean attribute transitions", () => {
  test("truthy to falsy removes the attribute", () => {
    const previous = vElementNode({ disabled: true });
    const vNode = vElementNode({ disabled: false });
    const recorded = fakeElement(vNode);

    const changes = compareAttributes(vNode, previous);
    expect(changes.length).toStrictEqual(1);
    expect(changes[0][Props.Type]).toStrictEqual(Type.Attribute);
    expect(changes[0][Props.Action]).toStrictEqual(Action.Delete);

    changes.forEach((change) => attribute(change as AttributeChangeSet));
    expect(recorded.remove).toStrictEqual(["disabled"]);
    expect(recorded.set).toStrictEqual([]);
  });

  test("falsy to truthy adds the bare attribute", () => {
    const previous = vElementNode({ disabled: false });
    const vNode = vElementNode({ disabled: true });
    const recorded = fakeElement(vNode);

    const changes = compareAttributes(vNode, previous);
    expect(changes.length).toStrictEqual(1);
    expect(changes[0][Props.Type]).toStrictEqual(Type.Attribute);
    expect(changes[0][Props.Action]).toStrictEqual(Action.Create);

    changes.forEach((change) => attribute(change as AttributeChangeSet));
    expect(recorded.set).toStrictEqual([["disabled", ""]]);
    expect(recorded.remove).toStrictEqual([]);
  });

  test("unchanged truthy values produce no changesets", () => {
    const changes = compareAttributes(
      vElementNode({ disabled: true }),
      vElementNode({ disabled: true }),
    );
    expect(changes).toStrictEqual([]);
  });

  test("boolean attributes dropped from props are deleted", () => {
    const changes = compareAttributes(vElementNode({}), vElementNode({ disabled: true }));

    const deletes = changes.filter((c) => c[Props.Action] === Action.Delete);
    expect(deletes.length).toStrictEqual(1);
    expect((deletes[0][Props.Payload] as { name: string }).name).toStrictEqual("disabled");
  });

  test("non-boolean attribute transitions stay verbatim", () => {
    const changes = compareAttributes(
      vElementNode({ class: "next" }),
      vElementNode({ class: "previous" }),
    );

    expect(changes.length).toStrictEqual(1);
    expect(changes[0][Props.Action]).toStrictEqual(Action.Create);
    expect((changes[0][Props.Payload] as { name: string; value: string }).value).toStrictEqual(
      "next",
    );
  });
});

test("media boolean attributes omitted when falsy", () => {
  // Regression: falsy values of omitted standard boolean attributes (e.g.
  // the media restriction attributes) must never be written verbatim.
  for (const name of [
    "disablepictureinpicture",
    "disableremoteplayback",
    "allowpaymentrequest",
    "webkitdirectory",
  ] as const) {
    const vNode = vElementNode({ [name]: false });
    const recorded = fakeElement(vNode);

    attribute(<CreateAttributeChangeSet>{
      [Props.Type]: Type.Attribute,
      [Props.Action]: Action.Create,
      [Props.Payload]: { vNode, name, value: false },
    });

    expect(recorded.set).toStrictEqual([]);
    expect(recorded.remove).toStrictEqual([name]);
  }
});

test("signal-driven disabled flip adds and removes the attribute", () => {
  const busy = signal(true);

  // Initial render with disabled={busy.get()} - control starts disabled.
  const previous = vElementNode({ disabled: busy.get() });
  const initialRecorded = fakeElement(previous);
  for (const change of setAttribute("disabled", previous[VNodeProps.PROPS].disabled, previous)) {
    attribute(change as AttributeChangeSet);
  }
  expect(initialRecorded.set).toStrictEqual([["disabled", ""]]);
  expect(initialRecorded.remove).toStrictEqual([]);

  // Flip to false: the diff must delete the attribute from the DOM.
  busy.set(false);
  const updated = vElementNode({ disabled: busy.get() });
  const updatedRecorded = fakeElement(updated);
  const removals = compareAttributes(updated, previous);
  expect(removals.length).toStrictEqual(1);
  expect(removals[0][Props.Action]).toStrictEqual(Action.Delete);
  removals.forEach((change) => attribute(change as AttributeChangeSet));
  expect(updatedRecorded.remove).toStrictEqual(["disabled"]);
  expect(updatedRecorded.set).toStrictEqual([]);

  // Flip back to true: the diff must re-add the bare attribute.
  busy.set(true);
  const reEnabled = vElementNode({ disabled: busy.get() });
  const reEnabledRecorded = fakeElement(reEnabled);
  const reAdds = compareAttributes(reEnabled, updated);
  expect(reAdds.length).toStrictEqual(1);
  expect(reAdds[0][Props.Action]).toStrictEqual(Action.Create);
  reAdds.forEach((change) => attribute(change as AttributeChangeSet));
  expect(reEnabledRecorded.set).toStrictEqual([["disabled", ""]]);
  expect(reEnabledRecorded.remove).toStrictEqual([]);
});

describe("compareAttributes numeric values", () => {
  test("update a changed number", () => {
    const previous = vElementNode({ tabindex: 1 });
    const vNode = vElementNode({ tabindex: 2 });
    const recorded = fakeElement(vNode);

    const changes = compareAttributes(vNode, previous);
    expect(changes.length).toStrictEqual(1);
    changes.forEach((change) => attribute(change as AttributeChangeSet));
    expect(recorded.set).toStrictEqual([["tabindex", "2"]]);
  });

  test("unchanged numbers produce no changesets", () => {
    expect(
      compareAttributes(vElementNode({ tabindex: 0 }), vElementNode({ tabindex: 0 })),
    ).toStrictEqual([]);
  });

  test("remove a dropped number", () => {
    const vNode = vElementNode({});
    const recorded = fakeElement(vNode);

    const changes = compareAttributes(vNode, vElementNode({ tabindex: 0 }));
    changes.forEach((change) => attribute(change as AttributeChangeSet));
    expect(recorded.remove).toStrictEqual(["tabindex"]);
    expect(recorded.set).toStrictEqual([]);
  });
});

describe("compareAttributes falsy previous values", () => {
  test("unchanged empty strings produce no changesets", () => {
    expect(
      compareAttributes(vElementNode({ class: "", alt: "" }), vElementNode({ class: "", alt: "" })),
    ).toStrictEqual([]);
  });

  test("unchanged false values produce no changesets", () => {
    expect(
      compareAttributes(
        vElementNode({ disabled: false, "data-on": false }),
        vElementNode({ disabled: false, "data-on": false }),
      ),
    ).toStrictEqual([]);
  });

  test("empty string transitions produce one update each", () => {
    const empty = vElementNode({ class: "" });
    const filled = vElementNode({ class: "x" });
    const emptyAgain = vElementNode({ class: "" });

    const toFilled = compareAttributes(filled, empty);
    const toEmpty = compareAttributes(emptyAgain, filled);

    expect(toFilled.length).toStrictEqual(1);
    expect(toFilled[0][Props.Action]).toStrictEqual(Action.Create);
    expect(toEmpty.length).toStrictEqual(1);
    expect(toEmpty[0][Props.Action]).toStrictEqual(Action.Create);

    const recorded = fakeElement(emptyAgain);
    toEmpty.forEach((change) => attribute(change as AttributeChangeSet));
    expect(recorded.set).toStrictEqual([["class", ""]]);
    expect(recorded.remove).toStrictEqual([]);
  });

  test("remove a dropped empty string", () => {
    const vNode = vElementNode({});
    const recorded = fakeElement(vNode);

    const changes = compareAttributes(vNode, vElementNode({ class: "" }));
    changes.forEach((change) => attribute(change as AttributeChangeSet));
    expect(recorded.remove).toStrictEqual(["class"]);
  });

  test("keep an empty string that is still set", () => {
    const changes = compareAttributes(
      vElementNode({ alt: "" }),
      vElementNode({ alt: "", class: "x" }),
    );

    expect(changes.length).toStrictEqual(1);
    expect(changes[0][Props.Action]).toStrictEqual(Action.Delete);
    expect((changes[0][Props.Payload] as { name: string }).name).toStrictEqual("class");
  });
});
