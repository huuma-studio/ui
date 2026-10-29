export enum SubscriberProps {
  update,
  cleanupCallback,
}

export interface Subscriber<T> {
  update: (value: T) => void;
  cleanupCallback?: (cleanup: Cleanup) => void;
}

export type Cleanup = {
  signal: Signal<unknown>;
  cleanup: () => void;
};

interface SubscriberScope {
  // Creation order, see notify().
  id: number;
  subscriber: Subscriber<never>;
  signals: Signal<unknown>[];
}

// The subscription of a computed signal to the signals it reads.
interface ComputedScope extends SubscriberScope {
  signal: Signal<unknown>;
  // The scopes that read the computed signal.
  readers: Set<SubscriberScope>;
  // Runs the callback again and returns whether the value changed.
  recompute: () => boolean;
}

const subscriberScopes: SubscriberScope[] = [];
let scopeCount = 0;

export function setSubscriber<T, S>(callback: () => T, subscriber: Subscriber<S>): T {
  return track({ id: scopeCount++, subscriber, signals: [] }, callback);
}

function track<T>(scope: SubscriberScope, callback: () => T): T {
  subscriberScopes.push(scope);
  try {
    return callback();
  } finally {
    // The scope must not survive a throwing callback: every later
    // signal.get() would subscribe this stale scope.
    subscriberScopes.pop();
  }
}

function isComputed(scope: SubscriberScope): scope is ComputedScope {
  return "recompute" in scope;
}

/*
 * A WritableSignal.set() notifies in two steps:
 * - Mark: collect every scope downstream of the signal, without running
 *   any.
 * - Settle: go through them in creation order. First recompute each
 *   computed if a signal it reads changed, so it computes once and only
 *   from settled values. Then run each other scope once if it still reads
 *   a signal that changed.
 * Creation order puts a computed after the signals it reads, and a
 * component before the children it renders, so a parent re-render cancels
 * the old child scopes before they would run.
 * A computed that throws keeps its old value and nothing that reads it is
 * updated. Every other scope still runs, then set() rethrows. The failed
 * and skipped scopes stay pending: the next set() that reaches them runs
 * them even if nothing they read changed, so they catch up.
 */
const pending = new WeakSet<SubscriberScope>();

function notify(source: Signal<unknown>, readers: Set<SubscriberScope>): void {
  const marked = new Set<SubscriberScope>();
  mark(marked, readers);
  const scopes = [...marked].sort((a, b) => a.id - b.id);
  const changed = new Set<Signal<unknown>>([source]);
  const failed = new Set<Signal<unknown>>();
  const errors: unknown[] = [];

  for (const scope of scopes) {
    if (!isComputed(scope)) continue;
    if (reads(scope, failed)) {
      failed.add(scope.signal);
      pending.add(scope);
    } else if (pending.has(scope) || reads(scope, changed)) {
      try {
        if (scope.recompute()) changed.add(scope.signal);
        pending.delete(scope);
      } catch (error) {
        failed.add(scope.signal);
        pending.add(scope);
        errors.push(error);
      }
    }
  }

  for (const scope of scopes) {
    if (isComputed(scope)) continue;
    if (reads(scope, failed)) {
      pending.add(scope);
      continue;
    }
    // Checked when it runs: an earlier subscriber may have canceled some
    // or all of its subscriptions.
    const from =
      lastRead(scope, changed) ??
      (pending.has(scope) ? scope.signals[scope.signals.length - 1] : undefined);
    if (!from) continue;
    pending.delete(scope);
    try {
      (<Subscriber<unknown>>scope.subscriber).update(untracked(() => from.get()));
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Signal subscribers failed");
  }
}

function mark(marked: Set<SubscriberScope>, readers: Set<SubscriberScope>): void {
  for (const scope of readers) {
    if (marked.has(scope)) continue;
    marked.add(scope);
    if (isComputed(scope)) mark(marked, scope.readers);
  }
}

// A loop instead of findLast(): the bundler targets browsers without it.
function lastRead(
  scope: SubscriberScope,
  signals: Set<Signal<unknown>>,
): Signal<unknown> | undefined {
  for (let i = scope.signals.length - 1; i >= 0; i--) {
    if (signals.has(scope.signals[i])) return scope.signals[i];
  }
}

function reads(scope: SubscriberScope, signals: Set<Signal<unknown>>): boolean {
  return !!signals.size && scope.signals.some((signal) => signals.has(signal));
}

export abstract class Signal<T> {
  abstract get(): T;
  abstract subscribe(subscriber: SubscriberScope): Cleanup;
}

export class WritableSignal<T> extends Signal<T> {
  #value: T;
  #scopes = new Set<SubscriberScope>();

  constructor(value: T) {
    super();
    this.#value = value;
  }

  get(): T {
    if (subscriberScopes.length) {
      this.subscribe(subscriberScopes[subscriberScopes.length - 1]);
    }
    return this.#value;
  }

  set(value: T): T {
    if (this.#value === value) return value;
    this.#value = value;
    notify(this, this.#scopes);
    return value;
  }

  subscribe(scope: SubscriberScope): Cleanup {
    const cleanup = this.#createCleanup(scope);
    if (!this.#scopes.has(scope)) {
      this.#scopes.add(scope);
      scope.signals.push(this);
      scope.subscriber.cleanupCallback?.call(this, cleanup);
    }

    return cleanup;
  }

  #createCleanup(scope: SubscriberScope): Cleanup {
    return {
      signal: this,
      cleanup: () => {
        scope.signals = scope.signals.filter((signal) => signal !== this);
        this.#scopes.delete(scope);
      },
    };
  }
}

export class ComputedSignal<T> extends Signal<T> {
  #value: T;
  #scopes = new Set<SubscriberScope>();

  constructor(callbackFn: () => T) {
    super();

    const scope: ComputedScope = {
      id: 0,
      // Never called: notify() recomputes computed signals itself.
      subscriber: { update: () => {} },
      signals: [],
      signal: this,
      readers: this.#scopes,
      recompute: () => {
        const value = untracked(callbackFn);
        if (value === this.#value) return false;
        this.#value = value;
        return true;
      },
    };
    this.#value = track(scope, callbackFn);
    // Numbered after its callback, so it comes after every computed it
    // reads, even one created inside the callback.
    scope.id = scopeCount++;
  }

  get(): T {
    if (subscriberScopes.length) {
      this.subscribe(subscriberScopes[subscriberScopes.length - 1]);
    }
    return this.#value;
  }

  subscribe(scope: SubscriberScope): Cleanup {
    if (!this.#scopes.has(scope)) {
      this.#scopes.add(scope);
      scope.signals.push(this);
      scope.subscriber.cleanupCallback?.call(this, this.#createCleanup(scope));
    }

    return this.#createCleanup(scope);
  }

  #createCleanup(scope: SubscriberScope): Cleanup {
    return {
      signal: this,
      cleanup: () => {
        this.#scopes.delete(scope);
        scope.signals = scope.signals.filter((signal) => signal !== this);
      },
    };
  }
}

export function signal<T>(value: T): WritableSignal<T> {
  return new WritableSignal(value);
}

export function computed<T>(callback: () => T): ComputedSignal<T> {
  return new ComputedSignal(callback);
}

export function effect(callback: () => void): () => void {
  const cleanups: Cleanup[] = [];
  setSubscriber(() => callback(), {
    update: callback,
    cleanupCallback: (cleanup) => {
      cleanups.push(cleanup);
    },
  });
  return () => {
    cleanups.forEach((cleanup) => {
      cleanup.cleanup();
    });
  };
}

export function untracked<T>(callbackFn: () => T): T {
  const _subscriberScopes = [...subscriberScopes];
  subscriberScopes.length = 0;
  try {
    return callbackFn();
  } finally {
    subscriberScopes.push(..._subscriberScopes);
  }
}
