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

interface Signal<T> {
  (): T;
  peek(): T;
  set(newValue: T): T;
}

export function signal<T>(value: T): Signal<T> {
  let subscribers: Subscriber<T>[] = [];

  const subscribe = (subscriber: Subscriber<T>): Cleanup => {
    if (!subscribers.find((existing) => existing === subscriber)) {
      subscribers.push(subscriber);
      subscriber.cleanupCallback?.call(signal, () => {
        subscribers = subscribers.filter(
          (existing) => existing !== subscriber,
        );
      });
    }

    return () => {
      subscribers = subscribers.filter(
        (existing) => existing === subscriber,
      );
    };
  };

  const set = (newValue: T): T => {
    value = newValue;
    notify();
    return value;
  };

  const notify = (): void => {
    subscribers?.forEach((subscriber) => {
      subscriber.update(value);
    });
  };

  const signalFn = (): T => {
    if (subscriber) {
      subscribe(<Subscriber<T>> subscriber);
    }
    return value;
  };

  const peek = (): T => {
    return value;
  };

  const Signal = Object.assign(signalFn, { set, peek });

  return <Signal<T>> Signal;
}
