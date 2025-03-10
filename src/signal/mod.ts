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

export function setSubscriber(
  newSubscriber: Subscriber<unknown>,
): void {
  subscribers.push(newSubscriber);
}

export function clearSubscriber(): void {
  subscribers.pop();
}

export class Signal<T> {
  #value: T;
  #subscribers: Subscriber<T>[] = [];

  constructor(value: T) {
    this.#value = value;
  }

  get get(): T {
    if (subscribers.length) {
      this.subscribe(<Subscriber<T>> subscribers[subscribers.length - 1]);
    }
    return this.#value;
  }

  set(value: T): T {
    this.#value = value;
    this.#notify();
    return value;
  }

  subscribe(subscriber: Subscriber<T>): Cleanup {
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

export function signal<T>(value: T): Signal<T> {
  return new Signal(value);
}
