import { type HasVOptions, type VBase, VNodeProps } from "../v-node/mod.ts";

export type Scope = VBase & HasVOptions;
let _scope: Scope | undefined;

export function scopedFn<T>(
  scope: Scope,
  fn: () => T,
): T {
  _scope = scope;
  const res = fn();
  _scope = undefined;
  return res;
}

export function $scope(): Scope {
  if (_scope) {
    return _scope;
  }
  throw Error(
    "No sync vnode scope found. Did you use a '${function}() in a async component?'",
  );
}

export const $route = $url;
export function $url(): URL {
  const url = $scope()[VNodeProps.OPTIONS]._GLOBAL.url;
  if (url instanceof URL) {
    return url;
  }
  throw new Error("No URL available in vNode scope");
}
