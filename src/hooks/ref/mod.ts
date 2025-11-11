import { type Ref, ref, refFromScope } from "./ref.ts";

export function $ref<T>(value: T): Ref<T> {
  return refFromScope(value, ref);
}
