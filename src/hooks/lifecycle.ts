import {
  getScope,
  isVComponent,
  VHook,
  VMode,
  VNodeProps,
} from "../v-node/mod.ts";

export function onMount(fn: (() => () => void) | (() => void)) {
  addHookVComponent(fn, VHook.ON_MOUNT);
}

export function onUnmount(fn: () => void) {
  addHookVComponent(fn, VHook.ON_UNMOUNT);
}

function addHookVComponent(
  fn: (() => () => void) | (() => void),
  vHook: VHook,
) {
  const scope = getScope();
  const vNode = scope[scope.length - 1];

  if (isVComponent(vNode) && vNode[VNodeProps.MODE] === VMode.NotCreated) {
    if (!vNode[VNodeProps.HOOKS]) {
      vNode[VNodeProps.HOOKS] = {};
    }

    vNode[VNodeProps.HOOKS][vHook] = Array.isArray(
      vNode[VNodeProps.HOOKS][vHook],
    )
      ? [
          ...(<((() => () => void) | (() => void))[]>(
            vNode[VNodeProps.HOOKS][vHook]
          )),
          fn,
        ]
      : [fn];
  }
}
