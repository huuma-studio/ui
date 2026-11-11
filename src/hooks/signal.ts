import { computed, effect, type Signal, signal, type WritableSignal } from "../signal/mod.ts";
import { VHook } from "../v-node/mod.ts";
import { $hook } from "./lifecycle.ts";
import { refFromScope } from "./ref/ref.ts";

export function $signal<T>(value: T): WritableSignal<T> {
  return <WritableSignal<T>>refFromScope<T>(value, signal);
}

export function $computed<T>(value: () => T): Signal<T> {
  const signal = refFromScope<T>(value, computed);
  // The signals it reads would otherwise keep it computing after the
  // component is removed. Registered on the first render only, which
  // creates it: later renders get the same signal.
  $hook(() => signal.dispose(), VHook.DESTROY);
  return signal;
}

export function $effect(fn: () => void): void {
  $hook(() => effect(fn), VHook.MOUNT);
}
