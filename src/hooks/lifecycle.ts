import { isVComponent, VHook, VMode, VNodeProps } from "../v-node/mod.ts";
import { $scope } from "./scope.ts";

export function $mount(fn: (() => () => void) | (() => void)): void {
  $hook(fn, VHook.MOUNT);
}

export function $destroy(fn: () => void): void {
  $hook(fn, VHook.DESTROY);
}

export function $hook(
  fn: (() => () => void) | (() => void),
  vHook: VHook,
) {
  const vNode = $scope();

  if (isVComponent(vNode) && vNode[VNodeProps.MODE] === VMode.NotCreated) {
    if (!vNode[VNodeProps.HOOKS]) {
      vNode[VNodeProps.HOOKS] = {};
    }

    vNode[VNodeProps.HOOKS][vHook] = Array.isArray(
        vNode[VNodeProps.HOOKS][vHook],
      )
      ? [
        ...(<((() => () => void) | (() => void))[]> (
          vNode[VNodeProps.HOOKS][vHook]
        )),
        fn,
      ]
      : [fn];
  }
}
