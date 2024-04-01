import {
  isEmptyNode,
  isTextNode,
  VHook,
  type VNode,
  vElement,
  vText,
  VNodeProps,
  VType,
  scope,
  type VElement,
  type VComponent,
  type VText,
} from "./ast.ts";

export function diff<T>(vNode: VNode<T>, snapshotOfVNode?: VNode<T>): [] {
  // Create the vNode
  if (vNode && !snapshotOfVNode) {
    return create(vNode);
  }

  // Delete the vNode
  if (!vNode && snapshotOfVNode) {
    if (snapshotOfVNode?.type === VType.COMPONENT) {
      // Cleanup state of component and its children components
      cleanup(snapshotOfVNode);
    }
    return [];
  }

  // Update VComponent
  if (
    vNode?.type === VType.COMPONENT &&
    snapshotOfVNode?.type === VType.COMPONENT
  ) {
    return component(vNode, snapshotOfVNode);
  }

  // Update VElement
  if (
    vNode?.type === VType.ELEMENT &&
    snapshotOfVNode?.type === VType.ELEMENT
  ) {
    return element(vNode, snapshotOfVNode);
  }

  // Update VText
  if (vNode?.type === VType.TEXT && snapshotOfVNode?.type === VType.TEXT) {
    return text(vNode, snapshotOfVNode);
  }

  throw Error("TODO: Implement fragment support");
}

function component<T>(
  vNode: VComponent<T>,
  snapshotOfVNode: VComponent<T>,
): [] {
  scope.push(vNode);
  const node = vNode.fn(vNode.props);
  scope.shift();

  if (typeof node === "undefined" || isEmptyNode(node)) {
    vNode.ast = undefined;
    return diff(vNode.ast, snapshotOfVNode.ast);
  }

  // Update text
  if (isTextNode(node)) {
    if (!snapshotOfVNode.ast) {
      vNode.ast = vText(node);
      return diff(vNode.ast);
    }

    if (
      snapshotOfVNode.ast.type === VType.COMPONENT ||
      snapshotOfVNode.ast.type === VType.ELEMENT
    ) {
      vNode.ast = vText(node);
      return [
        // Create the new VNode
        ...diff(vNode.ast),
        // Cleanup the old VNode
        ...diff(undefined, snapshotOfVNode.ast),
      ];
    }

    if (snapshotOfVNode.ast.type === VType.TEXT) {
      vNode.ast = {
        ...snapshotOfVNode.ast,
        ...vText(node),
      };
      return diff(vNode.ast, snapshotOfVNode.ast);
    }
    throw Error("TODO: Implement fragment support");
  }

  // Update element
  if (typeof node.type === "string") {
    if (!snapshotOfVNode.ast) {
      vNode.ast = vElement(<JSX.Element<string>>node);
      return diff(vNode.ast);
    }

    if (
      snapshotOfVNode.ast.type === VType.COMPONENT ||
      snapshotOfVNode.ast.type === VType.TEXT
    ) {
      vNode.ast = vElement(<JSX.Element<string>>node);
      return [
        // Create the new VElement
        ...diff(vNode.ast),
        // Cleanup the old VElement
        ...diff(undefined, snapshotOfVNode.ast),
      ];
    }

    if (snapshotOfVNode.ast.type === VType.ELEMENT) {
      if (snapshotOfVNode.ast.tag !== node.type) {
        vNode.ast = vElement(<JSX.Element<string>>node);
        return [
          // Create new VElement
          ...diff(vNode.ast),
          // Cleanup old VNode
          ...diff(undefined, snapshotOfVNode.ast),
        ];
      }

      // Do the element magic
      return [
        ...diffChildren(
          <JSX.Element<string>>node,
          <VElement<T>>vNode.ast,
          <VElement<T>>snapshotOfVNode.ast,
        ),
      ];
    }

    throw Error("TODO: Implement fragment support");
  }
  return [];
}

function element<T>(vNode: VElement<T>, snapshotOfVNode: VElement<T>): [] {
  return [];
}

function text<T>(vNode: VText<T>, snapshotOfVNode: VText<T>): [] {
  return [];
}

function diffChildren<T>(
  node: JSX.Element<string>,
  vNode: VElement<T>,
  snapshotOfVNode: VElement<T>,
): [];
function diffChildren<T>(
  node: JSX.Element<JSX.Component>,
  vNode: VComponent<T>,
  snapshotOfVNode: VComponent<T>,
): [];

function diffChildren<T>(
  node: JSX.Element<string | 0 | JSX.Component>,
  vNode: VComponent<T> | VElement<T>,
  snapshotOfVNode: VComponent<T> | VElement<T>,
): [] {
  if (
    typeof node.type === "string" &&
    vNode.type === VType.ELEMENT &&
    snapshotOfVNode.type === VType.ELEMENT
  ) {
    node.props.children?.forEach((child, i) => {
      const oldVNode = snapshotOfVNode.children
        ? snapshotOfVNode.children[i]
        : undefined;
      if (!child) {
        if (!oldVNode) {
          // Remove old VElement
          return diff(undefined, oldVNode);
        }
      }
      child;
      const a = snapshotOfVNode.props.children![i];
    });

    node.props.children;
    vNode;
  }
  /*
  button    -> COMPNT (a) ->  COMPNT (a) -> COMPNT (a) -> COMPNT (a)
  div       -> button     ->  COMPNT (c) -> COMPNT (c) -> COMPNT (c)
  button    -> div        ->  button     -> COMPNT (e) -> button
  undefined -> button     ->  div        -> button     -> div
  undefined -> COMPNT(b)  ->  button     -> div        -> button
               undefined  ->  COMPNT (b) -> button     -> COMPNT (b)
               undefined  ->  COMPNT (d) -> COMPNT (b) -> COMPNT (d)
                              undefined  -> COMPNT (d) -> undefined
                              undefined  -> COMPNT (f) -> undefined
  */
  return [];
}

function create<T>(vNode: VNode<T>): [] {
  if (vNode?.type === VType.COMPONENT) {
    if (vNode[VNodeProps.HOOKS] && vNode[VNodeProps.HOOKS]![VHook.ON_MOUNT]) {
      const cleanupHooks: (() => void)[] = [];
      vNode[VNodeProps.HOOKS][VHook.ON_MOUNT].forEach((hook) => {
        const cleanupFn = hook();
        if (typeof cleanupFn === "function") {
          cleanupHooks.push(cleanupFn);
        }
      });

      // Add additional onDestroy hooks coming form onMount hooks
      cleanupHooks.length && vNode[VNodeProps.HOOKS][VHook.ON_DESTROY]
        ? vNode[VNodeProps.HOOKS][VHook.ON_DESTROY].push(...cleanupHooks)
        : (vNode[VNodeProps.HOOKS][VHook.ON_DESTROY] = cleanupHooks);
      cleanupHooks.length;
    }

    return create(vNode.ast);
  }
  if (vNode?.type === VType.ELEMENT) {
    // Create platform node
    vNode.children?.map((childVNode) => create(childVNode));
    return [];
  }
  if (vNode?.type === VType.TEXT) {
    // Create platform text node
    return [];
  }
  if (vNode?.type === VType.FRAGMENT) {
    // Create platform text node
    return [];
  }
  return [];
}

function cleanup(vNode: VNode<unknown>) {
  // VComponent
  if (vNode?.type === VType.COMPONENT) {
    // State
    vNode[VNodeProps.CLEANUP].forEach((cleanup) => cleanup());
    // Continue with children
    return cleanup(vNode.ast);
  }
  // VElement
  if (
    (vNode?.type === VType.ELEMENT || vNode?.type === VType.FRAGMENT) &&
    vNode.children
  ) {
    // Looking for components
    for (const child of vNode.children) {
      cleanup(child);
      return; // TODO: Return delete vElement change set
    }
  }
  // VText
  if (vNode?.type === VType.TEXT) {
    return; // TODO: Return delete vText change set
  }

  return; // Empty array
}

export function snapshot<T>(vNode: VNode<T>): VNode<T> {
  if (vNode?.type === VType.COMPONENT) {
    const snapshotAst = snapshot(vNode.ast);
    return { ...vNode, ast: snapshotAst };
  }

  if (vNode?.type === VType.ELEMENT || vNode?.type === VType.FRAGMENT) {
    const snapshotChildren = vNode.children?.map((child) => snapshot(child));
    return { ...vNode, children: snapshotChildren };
  }

  if (vNode?.type === VType.TEXT) {
    return {
      ...vNode,
    };
  }

  return vNode;
}
