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

export function setSubscriber<T, S>(
  callback: () => T,
  subscriber: Subscriber<S>,
): T {
  return track({ subscriber, signals: [] }, callback);
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
 * - Mark: walk the scopes downstream of the signal, without running any.
 *   Each computed is recorded after its readers, so the reversed list has
 *   every computed after the computed signals it reads.
 * - Settle: recompute each marked computed in that order if a signal it
 *   reads changed, so it computes once and only from settled values. Then
 *   run each other scope once if it still reads a signal that changed.
 * A computed that throws keeps its old value and nothing that reads it is
 * updated. Every other scope still runs, then set() rethrows. The failed
 * and skipped scopes stay pending: the next pass that reaches them runs
 * them even if nothing they read changed, so they catch up on what the
 * failed pass skipped.
 */
interface Pass {
  // Every scope reached, in first-reached order.
  marked: Set<SubscriberScope>;
  computed: ComputedScope[];
  changed: Set<Signal<unknown>>;
  failed: Set<Signal<unknown>>;
}

const pending = new WeakSet<SubscriberScope>();

function notify(source: Signal<unknown>, readers: Set<SubscriberScope>): void {
  const pass: Pass = {
    marked: new Set(),
    computed: [],
    changed: new Set([source]),
    failed: new Set(),
  };
  const errors: unknown[] = [];
  mark(pass, readers);

  for (const scope of pass.computed.reverse()) {
    if (reads(scope, pass.failed)) {
      pass.failed.add(scope.signal);
      pending.add(scope);
    } else if (pending.has(scope) || reads(scope, pass.changed)) {
      try {
        if (scope.recompute()) pass.changed.add(scope.signal);
        pending.delete(scope);
      } catch (error) {
        pass.failed.add(scope.signal);
        pending.add(scope);
        errors.push(error);
      }
    }
  }

  for (const scope of pass.marked) {
    if (isComputed(scope)) continue;
    if (reads(scope, pass.failed)) {
      pending.add(scope);
      continue;
    }
    // Checked when it runs: an earlier subscriber may have canceled some
    // or all of its subscriptions.
    const source = scope.signals.findLast((signal) =>
      pass.changed.has(signal)
    ) ?? (pending.has(scope) ? scope.signals.at(-1) : undefined);
    if (!source) continue;
    pending.delete(scope);
    try {
      (<Subscriber<unknown>> scope.subscriber).update(
        untracked(() => source.get()),
      );
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Signal subscribers failed");
  }
}

function mark(pass: Pass, readers: Set<SubscriberScope>): void {
  for (const scope of readers) {
    if (pass.marked.has(scope)) continue;
    pass.marked.add(scope);
    if (isComputed(scope)) {
      mark(pass, scope.readers);
      pass.computed.push(scope);
    }
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
      // Never called: a pass recomputes computed signals itself.
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
