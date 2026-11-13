import {
  type Cleanup,
  computed,
  effect,
  Signal,
  signal,
  type WritableSignal,
} from "../signal/mod.ts";
import { VHook } from "../v-node/mod.ts";
import { hasVNodeUpdater } from "../v-node/sync.ts";
import { $hook } from "./lifecycle.ts";
import { refFromScope } from "./ref/ref.ts";

export function $signal<T>(value: T): WritableSignal<T> {
  return <WritableSignal<T>>refFromScope<T>(value, signal);
}

export function $computed<T>(value: () => T): Signal<T> {
  if (!hasVNodeUpdater()) return refFromScope<T>(value, onRead);
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

/**
 * What `$computed` returns in a server render, where the component renders
 * once and nothing removes it: no destroy hook would ever dispose a
 * computed signal. It would stay subscribed to the signals it reads, and
 * one that outlives the render, like a signal that islands share from a
 * module, would keep every render's computed signal, and run them all when
 * it's set.
 *
 * So this one subscribes to nothing: it runs its function on each read,
 * which always gives the current value (like a computed in Vue's server
 * renderer).
 */
class OnRead<T> extends Signal<T> {
  #read: () => T;

  constructor(read: () => T) {
    super();
    this.#read = read;
  }

  get(): T {
    return this.#read();
  }

  subscribe(): Cleanup {
    return { signal: this, cleanup: () => {} };
  }

  unsubscribe(): void {}
}

function onRead<T>(read: () => T): Signal<T> {
  return new OnRead(read);
}
