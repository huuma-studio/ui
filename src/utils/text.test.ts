import { expect, test } from "vite-plus/test";
import { WritableSignal } from "../signal/mod.ts";
import { toText } from "./text.ts";

test("toText returns static text as is", () => {
  expect(toText("")).toStrictEqual("");
  expect(toText("<b>")).toStrictEqual("<b>");
});

test("toText stringifies a signal's current value", () => {
  const value = new WritableSignal<string | number | boolean | null | undefined>(0);
  expect(toText(value)).toStrictEqual("0");
  value.set("x");
  expect(toText(value)).toStrictEqual("x");
  // Current behaviour, unlike static JSX, which renders these as nothing
  // (spec #132).
  value.set(null);
  expect(toText(value)).toStrictEqual("null");
  value.set(false);
  expect(toText(value)).toStrictEqual("false");
});
