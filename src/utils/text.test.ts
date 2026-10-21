import { expect, test } from "vite-plus/test";
import { WritableSignal } from "../signal/mod.ts";
import { toText, valueToText } from "./text.ts";

test("toText returns static text as is", () => {
  expect(toText("")).toStrictEqual("");
  expect(toText("<b>")).toStrictEqual("<b>");
});

test("toText returns a signal's current value as text", () => {
  const value = new WritableSignal<string | number | boolean | null | undefined>(0);
  expect(toText(value)).toStrictEqual("0");
  value.set("x");
  expect(toText(value)).toStrictEqual("x");
  value.set("");
  expect(toText(value)).toStrictEqual("");
});

test("valueToText leaves out what static JSX leaves out", () => {
  expect(valueToText(null)).toStrictEqual("");
  expect(valueToText(undefined)).toStrictEqual("");
  expect(valueToText(true)).toStrictEqual("");
  expect(valueToText(false)).toStrictEqual("");
  expect(valueToText(0)).toStrictEqual("0");
  expect(valueToText(Number.NaN)).toStrictEqual("");
  expect(valueToText(Number.POSITIVE_INFINITY)).toStrictEqual("");
  expect(valueToText(Number.NEGATIVE_INFINITY)).toStrictEqual("");
  expect(valueToText("")).toStrictEqual("");
  expect(valueToText("x")).toStrictEqual("x");
});
