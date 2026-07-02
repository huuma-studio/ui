import { assert } from "@std/assert";
import { isVSignal } from "../mod.ts";
import { computed, signal } from "../../signal/mod.ts";
import type { JSX } from "../../jsx-runtime/mod.ts";

Deno.test(isVSignal.name, () => {
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
