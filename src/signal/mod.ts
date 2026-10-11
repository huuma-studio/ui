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

interface SubscriberScope<T> {
  subscriber: Subscriber<T>;
  signals: Signal<unknown>[];
}

const subscriberScopes: SubscriberScope<unknown>[] = [];

export function setSubscriber<T, S>(
  callback: () => T,
  subscriber: Subscriber<S>,
): T {
  subscriberScopes.push(<SubscriberScope<unknown>> { subscriber, signals: [] });
  try {
    return callback();
  } finally {
    // The scope must not survive a throwing callback: every later
    // signal.get() would subscribe this stale scope.
    subscriberScopes.pop();
  }
}

/*
 * A notification pass starts at a WritableSignal.set() and spans the
 * computed signals it propagates through. Computed signals update
 * immediately; every other subscriber is queued and runs once when the
 * pass ends, so it sees the settled value of every computed it reads.
 * A throwing update does not stop the pass: every other subscriber still
 * runs, and the pass rethrows once it has ended. A computed that failed
 * keeps its old value, so nothing that reads it updates in that pass.
 */
interface QueuedScope {
  scope: { signals: Signal<unknown>[] };
  // Per source that queued the scope: delivers that source's value.
  updates: Map<Signal<unknown>, () => void>;
}

interface Pass {
  updatedComputed: Set<object>;
  // Keyed by scope: a scope reached several times in a pass runs once.
  queue: Map<object, QueuedScope>;
  // Computed signals that threw, or read one that did, in this pass.
  failed: Set<Signal<unknown>>;
  errors: unknown[];
}

let currentPass: Pass | undefined;

// Maps the internal subscriber of each computed signal to that signal.
const computedSubscribers = new WeakMap<object, Signal<unknown>>();

function notifyScopes<T>(
  source: Signal<T>,
  scopes: Set<SubscriberScope<T>>,
  read: () => T,
  startPass: boolean,
): void {
  const previousPass = currentPass;
  const ownsPass = startPass || !currentPass;
  const pass: Pass = currentPass = ownsPass
    ? {
      updatedComputed: new Set(),
      queue: new Map(),
      failed: new Set(),
      errors: [],
    }
    : <Pass> currentPass;

  try {
    const deferred: SubscriberScope<T>[] = [];
    for (const scope of [...scopes]) {
      // Unsubscribed earlier in this pass (e.g. a child component whose
      // parent re-rendered): its subscriber closes over stale state.
      if (!scopes.has(scope)) continue;

      if (!computedSubscribers.has(scope.subscriber)) {
        let queued = pass.queue.get(scope);
        if (!queued) {
          queued = { scope, updates: new Map() };
          pass.queue.set(scope, queued);
        }
        queued.updates.set(source, () => scope.subscriber.update(read()));
        continue;
      }
      // Glitch avoidance: let the dependent computed signals update first.
      if (scope.signals.some((signal) => signal.dependsOn(source))) {
        deferred.push(scope);
        continue;
      }
      pass.updatedComputed.add(scope);
      updateComputed(pass, scope, read);
    }

    // Deferred computed signals still need the update when no computed
    // reached them, i.e. when the computed values did not change.
    for (const scope of deferred) {
      if (!scopes.has(scope) || pass.updatedComputed.has(scope)) continue;
      pass.updatedComputed.add(scope);
      updateComputed(pass, scope, read);
    }

    if (ownsPass) {
      flush(pass);
    }
  } finally {
    currentPass = previousPass;
  }
}

function updateComputed<T>(
  pass: Pass,
  scope: SubscriberScope<T>,
  read: () => T,
): void {
  const computed = <Signal<unknown>> computedSubscribers.get(scope.subscriber);
  // Updating it from the old value of a failed computed would publish a
  // mix of new and old values.
  if (readsFailed(pass, scope)) {
    pass.failed.add(computed);
    return;
  }
  try {
    scope.subscriber.update(read());
  } catch (error) {
    // Errors of its own subscribers are caught in its nested notification,
    // so this is its own callback.
    pass.failed.add(computed);
    pass.errors.push(error);
  }
}

function readsFailed(
  pass: Pass,
  scope: { signals: Signal<unknown>[] },
): boolean {
  return !!pass.failed.size &&
    scope.signals.some((signal) => pass.failed.has(signal));
}

function flush(pass: Pass): void {
  for (const { scope, updates } of pass.queue.values()) {
    // Deliver through a source the scope still subscribes to: an earlier
    // subscriber of this pass may have canceled some or all of them.
    let update: (() => void) | undefined;
    for (const [source, deliver] of updates) {
      if (scope.signals.includes(source)) update = deliver;
    }
    if (!update || readsFailed(pass, scope)) continue;
    try {
      update();
    } catch (error) {
      pass.errors.push(error);
    }
  }

  if (pass.errors.length === 1) throw pass.errors[0];
  if (pass.errors.length > 1) {
    throw new AggregateError(pass.errors, "Signal subscribers failed");
  }
}

export abstract class Signal<T> {
  abstract get(): T;
  abstract subscribe(subscriber: SubscriberScope<T>): Cleanup;
  abstract dependsOn(signal: Signal<unknown>): boolean;
}

export class WritableSignal<T> extends Signal<T> {
  #value: T;
  #scopes = new Set<SubscriberScope<T>>();

  constructor(value: T) {
    super();
    this.#value = value;
  }

  get(): T {
    if (subscriberScopes.length) {
      this.subscribe(
        <SubscriberScope<T>> subscriberScopes[subscriberScopes.length - 1],
      );
    }
    return this.#value;
  }

  set(value: T): T {
    if (this.#value === value) return value;
    this.#value = value;
    this.#notify();
    return value;
  }

  dependsOn(_: Signal<unknown>): boolean {
    return false;
  }

  subscribe(scope: SubscriberScope<T>): Cleanup {
    const cleanup = this.#createCleanup(scope);
    if (!this.#scopes.has(scope)) {
      this.#scopes.add(scope);
      scope.signals.push(this);
      scope.subscriber.cleanupCallback?.call(this, cleanup);
    }

    return cleanup;
  }

  #createCleanup(scope: SubscriberScope<T>): Cleanup {
    return {
      signal: this,
      cleanup: () => {
        scope.signals = scope.signals.filter((signal) => signal !== this);
        this.#scopes.delete(scope);
      },
    };
  }

  #notify(): void {
    notifyScopes(this, this.#scopes, () => this.#value, true);
  }
}

export class ComputedSignal<T> extends Signal<T> {
  #value: T;
  #scopes = new Set<SubscriberScope<T>>();
  #cleanups: Cleanup[] = [];

  constructor(callbackFn: () => T) {
    super();

    const subscriber: Subscriber<T> = {
      update: () => {
        const value = callbackFn();
        if (value !== this.#value) {
          this.#set(value);
        }
      },
      cleanupCallback: (cleanup) => {
        this.#cleanups.push(cleanup);
      },
    };
    computedSubscribers.set(subscriber, this);

    this.#value = setSubscriber(() => callbackFn(), subscriber);
  }

  dependsOn(signal: Signal<unknown>): boolean {
    return !!this.#cleanups.find((cleanup) => cleanup.signal === signal);
  }

  get(): T {
    if (subscriberScopes.length) {
      this.subscribe(
        <SubscriberScope<T>> subscriberScopes[subscriberScopes.length - 1],
      );
    }
    return this.#value;
  }

  #set(value: T): T {
    if (value === this.#value) return value;
    this.#value = value;
    this.#notify();
    return value;
  }

  subscribe(scope: SubscriberScope<T>): Cleanup {
    if (!this.#scopes.has(scope)) {
      this.#scopes.add(scope);
      scope.signals.push(this);
      scope.subscriber.cleanupCallback?.call(this, this.#createCleanup(scope));
    }

    return this.#createCleanup(scope);
  }

  #createCleanup(scope: SubscriberScope<T>): Cleanup {
    return {
      signal: this,
      cleanup: () => {
        this.#scopes.delete(scope);
        scope.signals = scope.signals.filter((signal) => signal !== this);
      },
    };
  }

  #notify(): void {
    // Propagates the change of the source signal: stays in its pass.
    notifyScopes(this, this.#scopes, () => this.#value, false);
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
  const value = callbackFn();
  subscriberScopes.push(..._subscriberScopes);
  return value;
}
