import { type Ref, ref } from "../../ref/mod.ts";
import { refFromScope } from "./ref.ts";

export function $ref<T>(value: T): Ref<T> {
  return refFromScope(value, ref);
}
