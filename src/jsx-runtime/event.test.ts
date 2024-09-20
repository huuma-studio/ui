import { eventName, isEventName } from "./event.ts";
import { assertEquals } from "std/assert/mod.ts";

Deno.test("Event: isEventName", () => {
  assertEquals(isEventName(""), false);
  assertEquals(isEventName(""), false);
  assertEquals(isEventName("on-click is is"), false);
  assertEquals(isEventName("on-click"), true);
});

Deno.test("Event: eventName", () => {
  assertEquals(eventName(""), "");
  assertEquals(eventName("On-click"), "On-click");
  assertEquals(eventName("on-click is is"), "click is is");
  assertEquals(eventName("on-click"), "click");
});
