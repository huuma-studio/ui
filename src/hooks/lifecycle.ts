import {
  getVNodeScope,
  isVComponent,
  VHook,
  VMode,
  VNodeProps,
} from "../v-node/mod.ts";

export function $mount(fn: (() => () => void) | (() => void)): void {
  addHookVComponent(fn, VHook.MOUNT);
}

export function $unmount(fn: () => void): void {
  addHookVComponent(fn, VHook.UNMOUNT);
}

export function addHookVComponent(
  fn: (() => () => void) | (() => void),
  vHook: VHook,
) {
  const vNodeScope = getVNodeScope();
  const vNode = vNodeScope[vNodeScope.length - 1];

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
