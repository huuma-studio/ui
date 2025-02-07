export enum SubscriberProps {
  update,
  cleanupCallback,
}

export interface Subscriber<T> {
  update: (value: T) => void;
  cleanupCallback?: (cleanup: Cleanup) => void;
}

export type Cleanup = () => void;

let subscriber: Subscriber<unknown> | undefined;

export function setSubscriber(newSubscriber: Subscriber<unknown> | undefined) {
  subscriber = newSubscriber;
}

export function clearSubscriber() {
  subscriber = undefined;
}

export class State<T> {
  #value: T;
  #subscribers: Subscriber<T>[] = [];

  constructor(value: T) {
    this.#value = value;
  }

  get get(): T {
    if (subscriber) {
      this.subscribe(<Subscriber<T>> subscriber);
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

  #notify() {
    this.#subscribers?.forEach((subscriber) => {
      subscriber.update(this.#value);
    });
  }
}
