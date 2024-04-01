import { scope, VHook, VMode, VNodeProps } from "../ast.ts";

export function onMount(fn: (() => () => void) | (() => void)) {
  const vComponent = scope[scope.length - 1];

  if (vComponent.mode === VMode.NotCreated) {
    if (!vComponent[VNodeProps.HOOKS]) {
      vComponent[VNodeProps.HOOKS] = {};
    }

    vComponent[VNodeProps.HOOKS][VHook.ON_MOUNT] =
      Array.isArray(vComponent[VNodeProps.HOOKS][VHook.ON_MOUNT])
        ? [...vComponent[VNodeProps.HOOKS][VHook.ON_MOUNT], fn]
        : [fn];
  }
}

export function onDestroy(fn: () => void) {
  const vComponent = scope[scope.length - 1];

  if (vComponent.mode === VMode.NotCreated) {
    if (!vComponent[VNodeProps.HOOKS]) {
      vComponent[VNodeProps.HOOKS] = {};
    }

    vComponent[VNodeProps.HOOKS][VHook.ON_DESTROY] =
      Array.isArray(vComponent[VNodeProps.HOOKS][VHook.ON_DESTROY])
        ? [...vComponent[VNodeProps.HOOKS][VHook.ON_DESTROY], fn]
        : [fn];
  }
}
