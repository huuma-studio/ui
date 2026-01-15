export class Ref<T> {
  #value: T;
  constructor(value: T) {
    this.#value = value;
  }

  get get(): T {
    return this.#value;
  }

  set set(value: T) {
    this.#value = value;
  }
}

export function ref<T>(value: T): Ref<T> {
  return new Ref(value);
}
