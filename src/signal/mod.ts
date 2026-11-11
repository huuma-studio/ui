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
  // The signals read so far in a retrack() run.
  seen?: Set<Signal<unknown>>;
}

// The subscription of a computed signal to the signals it reads.
interface ComputedScope extends SubscriberScope {
  signal: Signal<unknown>;
  // The scopes that read the computed signal.
  readers: Set<SubscriberScope>;
  // Runs the callback again, tracked, without storing the value.
  run: () => unknown;
  // Stores the value and returns whether it changed.
  commit: (value: unknown) => boolean;
}

const subscriberScopes: SubscriberScope[] = [];
let scopeCount = 0;
const computedScopes = new WeakMap<Signal<unknown>, ComputedScope>();

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

/*
 * Runs a callback again under its scope: it subscribes to what it reads
 * now, so a signal read only in a branch taken later is tracked too. Then
 * it drops the signals it no longer reads. A throwing callback drops
 * nothing, as it may not have reached all of its reads.
 */
function retrack<T>(scope: SubscriberScope, callback: () => T): T {
  const seen = new Set<Signal<unknown>>();
  scope.seen = seen;
  try {
    const value = track(scope, callback);
    for (const signal of scope.signals) {
      if (!seen.has(signal)) signal.unsubscribe(scope);
    }
    return value;
  } finally {
    scope.seen = undefined;
  }
}

// Subscribes the running scope, if any, to a signal it reads.
function subscribeRunning(signal: Signal<unknown>): void {
  const scope = subscriberScopes[subscriberScopes.length - 1];
  if (!scope) return;
  scope.seen?.add(signal);
  signal.subscribe(scope);
}

function isComputed(scope: SubscriberScope): scope is ComputedScope {
  return "run" in scope;
}

/*
 * A WritableSignal.set() notifies in two steps:
 * - Mark: collect every scope downstream of the signal, without running
 *   any.
 * - Settle: go through them in creation order. First recompute each
 *   computed if a signal it reads changed, so it computes once and only
 *   from settled values. Then run each other scope once if it still reads
 *   a signal that changed.
 * Creation order puts a component before the children it renders, so a
 * parent re-render cancels the old child scopes before they would run.
 * A computed is settled after the computed signals it reads, which
 * creation order alone can't promise: a retracked computed may start to
 * read one created after it. So settle() first settles what a computed
 * reads, and a computed read during a recompute settles on get().
 * A computed that throws keeps its old value and nothing that reads it is
 * updated. Every other scope still runs, then set() rethrows. The failed
 * and skipped scopes stay pending: the next set() that reaches them runs
 * them even if nothing they read changed, so they catch up.
 */
const pending = new WeakSet<SubscriberScope>();

interface Pass {
  marked: Set<SubscriberScope>;
  settled: Set<ComputedScope>;
  changed: Set<Signal<unknown>>;
  failed: Set<Signal<unknown>>;
  errors: unknown[];
}

// The pass settling its computed signals; a set() inside starts a new one.
let currentPass: Pass | undefined;

function notify(source: Signal<unknown>, readers: Set<SubscriberScope>): void {
  const marked = new Set<SubscriberScope>();
  mark(marked, readers);
  const scopes = [...marked].sort((a, b) => a.id - b.id);
  const pass: Pass = {
    marked,
    settled: new Set(),
    changed: new Set([source]),
    failed: new Set(),
    errors: [],
  };
  const { changed, failed, errors } = pass;

  const outerPass = currentPass;
  currentPass = pass;
  try {
    for (const scope of scopes) {
      if (isComputed(scope)) settle(pass, scope);
    }
  } finally {
    currentPass = outerPass;
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

function settle(pass: Pass, scope: ComputedScope): void {
  if (pass.settled.has(scope)) return;
  // Added first: a cycle reads the old value instead of recursing.
  pass.settled.add(scope);

  for (const signal of scope.signals) {
    const upstream = computedScopes.get(signal);
    if (upstream && pass.marked.has(upstream)) settle(pass, upstream);
  }

  if (reads(scope, pass.failed)) {
    pass.failed.add(scope.signal);
    pending.add(scope);
    return;
  }
  if (!pending.has(scope) && !reads(scope, pass.changed)) return;

  let value: unknown;
  try {
    value = scope.run();
  } catch (error) {
    pass.failed.add(scope.signal);
    pending.add(scope);
    pass.errors.push(error);
    return;
  }
  // The run may have read a computed for the first time that failed.
  if (reads(scope, pass.failed)) {
    pass.failed.add(scope.signal);
    pending.add(scope);
    return;
  }
  if (scope.commit(value)) pass.changed.add(scope.signal);
  pending.delete(scope);
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
  abstract unsubscribe(subscriber: SubscriberScope): void;
}

export class WritableSignal<T> extends Signal<T> {
  #value: T;
  #scopes = new Set<SubscriberScope>();

  constructor(value: T) {
    super();
    this.#value = value;
  }

  get(): T {
    subscribeRunning(this);
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

  unsubscribe(scope: SubscriberScope): void {
    scope.signals = scope.signals.filter((signal) => signal !== this);
    this.#scopes.delete(scope);
  }

  #createCleanup(scope: SubscriberScope): Cleanup {
    return {
      signal: this,
      cleanup: () => this.unsubscribe(scope),
    };
  }
}

export class ComputedSignal<T> extends Signal<T> {
  #value: T;
  #scopes = new Set<SubscriberScope>();
  #scope: ComputedScope;

  constructor(callbackFn: () => T) {
    super();

    const scope: ComputedScope = {
      id: 0,
      // Never called: notify() recomputes computed signals itself.
      subscriber: { update: () => {} },
      signals: [],
      signal: this,
      readers: this.#scopes,
      run: () => retrack(scope, callbackFn),
      commit: (value) => {
        if (value === this.#value) return false;
        this.#value = <T>value;
        return true;
      },
    };
    this.#scope = scope;
    computedScopes.set(this, scope);
    this.#value = track(scope, callbackFn);
    // Numbered after its callback, so it comes after every computed it
    // reads, even one created inside the callback.
    scope.id = scopeCount++;
  }

  get(): T {
    // Read during a recompute, maybe for the first time: settle it first.
    if (currentPass?.marked.has(this.#scope)) settle(currentPass, this.#scope);
    subscribeRunning(this);
    return this.#value;
  }

  /**
   * Stops computing: unsubscribes from the signals it reads now, so they
   * no longer keep it alive and run its callback. It keeps its last value.
   * A component disposes its `$computed` signals when it's removed.
   */
  dispose(): void {
    for (const signal of this.#scope.signals) signal.unsubscribe(this.#scope);
  }

  subscribe(scope: SubscriberScope): Cleanup {
    if (!this.#scopes.has(scope)) {
      this.#scopes.add(scope);
      scope.signals.push(this);
      scope.subscriber.cleanupCallback?.call(this, this.#createCleanup(scope));
    }

    return this.#createCleanup(scope);
  }

  unsubscribe(scope: SubscriberScope): void {
    this.#scopes.delete(scope);
    scope.signals = scope.signals.filter((signal) => signal !== this);
  }

  #createCleanup(scope: SubscriberScope): Cleanup {
    return {
      signal: this,
      cleanup: () => this.unsubscribe(scope),
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
  const scope: SubscriberScope = {
    id: scopeCount++,
    subscriber: { update: () => retrack(scope, callback) },
    signals: [],
  };
  track(scope, callback);
  return () => {
    for (const signal of scope.signals) signal.unsubscribe(scope);
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
