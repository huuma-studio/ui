export enum SubscriberProps {
  update,
  cleanupCallback,
}

export interface Subscriber<T> {
  update: (value: T) => void;
  cleanupCallback?: (cleanup: Cleanup) => void;
}

export type Cleanup = () => void;

const subscribers: Subscriber<unknown>[] = [];

export function setSubscriber<T>(
  scopedCallback: () => T,
  newSubscriber: Subscriber<unknown>,
): T {
  subscribers.push(newSubscriber);
  const value = scopedCallback();
  subscribers.pop();
  return value;
}

export abstract class Signal<T> {
  abstract get(): T;
}

export class WritableSignal<T> extends Signal<T> {
  #value: T;
  #subscribers: Subscriber<T>[] = [];

  constructor(value: T) {
    super();
    this.#value = value;
  }

  get(): T {
    if (subscribers.length) {
      this.#subscribe(<Subscriber<T>> subscribers[subscribers.length - 1]);
    }
    return this.#value;
  }

  set(value: T): T {
    this.#value = value;
    this.#notify();
    return value;
  }

  #subscribe(subscriber: Subscriber<T>): Cleanup {
    if (!this.#subscribers.find((existing) => existing === subscriber)) {
      this.#subscribers.push(subscriber);
      subscriber.cleanupCallback?.call(this, () => {
        this.#subscribers = this.#subscribers.filter(
          (existing) => existing !== subscriber,
        );
      });
    }

    return () => {
      this.#subscribers = this.#subscribers.filter(
        (existing) => existing === subscriber,
      );
    };
  }

  #notify(): void {
    this.#subscribers?.forEach((subscriber) => {
      subscriber.update(this.#value);
    });
  }
}

export function signal<T>(value: T): WritableSignal<T> {
  return new WritableSignal(value);
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
    cleanups.forEach((cleanup) => cleanup());
  };
}

export class ComputedSignal<T> extends Signal<T> {
  #value: T;
  #subscribers: Subscriber<T>[] = [];
  #cleanups: Cleanup[] = [];

  constructor(callbackFn: () => T) {
    super();

    const value = setSubscriber(
      () => callbackFn(),
      {
        update: () => {
          this.#set(callbackFn());
        },
        cleanupCallback: (cleanup) => {
          this.#cleanups.push(cleanup);
        },
      },
    );
    this.#value = value;
  }

  get(): T {
    if (subscribers.length) {
      this.#subscribe(<Subscriber<T>> subscribers[subscribers.length - 1]);
    }
    return this.#value;
  }

  #set(value: T): void {
    this.#value = value;
    this.#notify();
  }

  #subscribe(subscriber: Subscriber<T>): Cleanup {
    if (!this.#subscribers.find((existing) => existing === subscriber)) {
      this.#subscribers.push(subscriber);
      subscriber.cleanupCallback?.call(this, () => {
        this.#subscribers = this.#subscribers.filter(
          (existing) => existing !== subscriber,
        );
      });
    }

    return () => {
      this.#subscribers = this.#subscribers.filter(
        (existing) => existing === subscriber,
      );
    };
  }

  #notify(): void {
    this.#subscribers?.forEach((subscriber) => {
      subscriber.update(this.#value);
    });
  }
}

export function computed<T>(callback: () => T): ComputedSignal<T> {
  return new ComputedSignal(callback);
}
