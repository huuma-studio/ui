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
  subscriberScopes.push(
    <SubscriberScope<unknown>> { subscriber, signals: [] },
  );
  const value = callback();
  subscriberScopes.pop();
  return value;
}

export abstract class Signal<T> {
  abstract get(): T;
  abstract subscribe(subscriber: SubscriberScope<T>): Cleanup;
  abstract dependsOn(signal: Signal<unknown>): boolean;
}

export class WritableSignal<T> extends Signal<T> {
  #value: T;
  #scopes: SubscriberScope<T>[] = [];

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
    if (!this.#scopes.find((existing) => existing === scope)) {
      this.#scopes.push(scope);
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
        this.#scopes = this.#scopes.filter(
          (existing) => existing !== scope,
        );
      },
    };
  }

  #notify(): void {
    const scopes: SubscriberScope<T>[] = this.#scopes.map((scope) => ({
      signals: [...scope.signals],
      subscriber: scope.subscriber,
    }));
    scopes.forEach((scope) => {
      if (!scope.signals.filter((signal) => signal.dependsOn(this)).length) {
        scope.subscriber.update(this.#value);
      }
    });
  }
}

export class ComputedSignal<T> extends Signal<T> {
  #value: T;
  #scopes: SubscriberScope<T>[] = [];
  #cleanups: Cleanup[] = [];

  constructor(callbackFn: () => T) {
    super();

    const value = setSubscriber(
      () => callbackFn(),
      {
        update: () => {
          const value = callbackFn();
          if (value !== this.#value) {
            this.#set(value);
          }
        },
        cleanupCallback: (cleanup) => {
          this.#cleanups.push(cleanup);
        },
      },
    );
    this.#value = value;
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
    if (!this.#scopes.find((existing) => existing === scope)) {
      this.#scopes.push(scope);
      scope.signals.push(this);
      scope.subscriber.cleanupCallback?.call(this, this.#createCleanup(scope));
    }

    return this.#createCleanup(scope);
  }

  #createCleanup(scope: SubscriberScope<T>): Cleanup {
    return {
      signal: this,
      cleanup: () => {
        this.#scopes = this.#scopes.filter(
          (existing) => existing !== scope,
        );
        scope.signals = scope.signals.filter((signal) => signal !== this);
      },
    };
  }

  #notify(): void {
    const scopes: SubscriberScope<T>[] = this.#scopes.map((scope) => ({
      signals: [...scope.signals],
      subscriber: scope.subscriber,
    }));
    scopes.forEach((scope) => {
      if (!scope.signals.filter((signal) => signal.dependsOn(this)).length) {
        scope.subscriber.update(this.#value);
      }
    });
  }
}

export function signal<T>(value: T): WritableSignal<T> {
  return new WritableSignal(value);
}

export function computed<T>(callback: () => T): ComputedSignal<T> {
  return new ComputedSignal(callback);
}

export function effect(
  callback: () => void,
): () => void {
  const cleanups: Cleanup[] = [];
  setSubscriber(
    () => callback(),
    {
      update: callback,
      cleanupCallback: (cleanup) => {
        cleanups.push(cleanup);
      },
    },
  );
  return () => {
    cleanups.forEach((cleanup) => {
      cleanup.cleanup();
    });
  };
}

export function untracked<T>(callbackFn: () => T): T {
  return setSubscriber(callbackFn, {
    update: () => void 0,
  });
}
