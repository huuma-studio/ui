import { getVNodeScope, VNodeProps } from "../v-node/mod.ts";

export function $scope() {
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
