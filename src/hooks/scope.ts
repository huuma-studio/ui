import {
  getVNodeScope,
  type HasVOptions,
  type VBase,
  VNodeProps,
} from "../v-node/mod.ts";

export function $scope(): VBase & HasVOptions {
  return getVNodeScope()[0];
}

export const $route = $url;
export function $url(): URL {
  const url = getVNodeScope()[0][VNodeProps.OPTIONS]._GLOBAL.url;
  if (url instanceof URL) {
    return url;
  }
  throw new Error("No URL available in vNode scope");
}
