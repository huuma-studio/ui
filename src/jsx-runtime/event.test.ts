import { expect, test } from "vite-plus/test";
import { eventName, isEventName } from "./event.ts";

test("Event: isEventName", () => {
  expect(isEventName("")).toStrictEqual(false);
  expect(isEventName("")).toStrictEqual(false);
  expect(isEventName("on-click is is")).toStrictEqual(false);
  expect(isEventName("on-click")).toStrictEqual(true);
});

test("Event: eventName", () => {
  expect(eventName("")).toStrictEqual("");
  expect(eventName("On-click")).toStrictEqual("On-click");
  expect(eventName("on-click is is")).toStrictEqual("click is is");
  expect(eventName("on-click")).toStrictEqual("click");
});
