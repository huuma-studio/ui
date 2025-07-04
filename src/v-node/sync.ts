import { scopedFn } from "../hooks/scope.ts";
import type { JSX } from "../jsx-runtime/mod.ts";
import { setSubscriber, type Subscriber } from "../signal/mod.ts";
import {
  childrenFrom,
  cleanup,
  isArray,
  isComponentNode,
  isElementNode,
  isEmptyNode,
  isFragmentNode,
  isTemplateNode,
  isTextNode,
  isVComponent,
  isVSignal,
  keyFromNode,
  keyFromVNode,
  type VComponent,
  type VElement,
  type VFragment,
  type VGlobalOptions,
  VMode,
  type VNode,
  VNodeProps,
  type VText,
  vText,
  VType,
} from "./mod.ts";

type VNodeSignalUpdater<T, V> = (
  node: JSX.ComponentNode<JSX.Component>,
  vNode: VComponent<T>,
  globalOptions: VGlobalOptions,
) => Subscriber<V>;
let vNodeSignalUpdater: VNodeSignalUpdater<unknown, unknown> | undefined;

export function setVNodeUpdater<T>(
  updater: VNodeSignalUpdater<T, unknown>,
): void {
  vNodeSignalUpdater = <VNodeSignalUpdater<unknown, unknown>> updater;
}

export function create<T>(
  node: JSX.Element,
  globalOptions: VGlobalOptions = {},
): VNode<T> {
  if (typeof globalOptions.beforeCreate === "function") {
    node = globalOptions.beforeCreate(node);
  }

  if (isEmptyNode(node)) {
    return null;
  }

  if (isTextNode(node)) {
    return vText(node);
  }

  if (isElementNode(node)) {
    return vElement(node, globalOptions);
  }

  if (isFragmentNode(node) || isTemplateNode(node)) {
    return vFragment(node, globalOptions);
  }

  if (isComponentNode(node)) {
    return vComponent(node, globalOptions);
  }
}

export function update<T>(
  node: JSX.Element,
  vNode: VNode<T> | undefined,
  globalOptions: VGlobalOptions,
  cleanupVNode = true,
): VNode<T> {
  /*
   * Root update call should cleanup the vNode.
   * Subsequent nested update calls do not need to cleanup.
   */
  if (cleanupVNode) {
    cleanup(vNode);
  }

  if (isEmptyNode(node) || typeof node === "undefined") {
    return null;
  }

  if (isTextNode(node)) {
    if (vNode?.type === VType.TEXT) {
      return updateVText(node, vNode);
    }
    return vText(node);
  }

  if (isElementNode(node)) {
    if (
      vNode?.type === VType.ELEMENT && node.type === vNode[VNodeProps.TAG] &&
      vNode[VNodeProps.KEY] === node.key
    ) {
      return updateVElement(
        <JSX.ComponentNode<string>> node,
        vNode,
        globalOptions,
      );
    }
    return vElement(node, globalOptions);
  }

  if (isComponentNode(node)) {
    if (
      isVComponent(vNode) && vNode[VNodeProps.FN] === node.type &&
      vNode[VNodeProps.KEY] === node.key
    ) {
      return updateVComponent(node, vNode, globalOptions);
    }
    return vComponent(node, globalOptions);
  }

  if (isFragmentNode(node)) {
    if (
      vNode?.type === VType.FRAGMENT &&
      keyFromNode(node) === vNode[VNodeProps.KEY]
    ) {
      return updateVFragment(node, vNode, globalOptions);
    }
    return vFragment(node, globalOptions);
  }
}

function updateVText<T>(
  node: string | number | JSX.SignalLike,
  vText: VText<T>,
): VText<T> {
  vText[VNodeProps.TEXT] = isVSignal(node) ? node : `${node}`;
  return vText;
}

export function vElement<T>(
  element: JSX.ComponentNode<string>,
  globalOptions: VGlobalOptions,
): VElement<T> {
  const { type, eventRefs, props, key } = element;
  const vElement: VElement<T> = {
    type: VType.ELEMENT,
    [VNodeProps.TAG]: type,
    [VNodeProps.KEY]: key,
    [VNodeProps.PROPS]: props,
    [VNodeProps.EVENT_REFS]: eventRefs,
    [VNodeProps.CHILDREN]: [],
    [VNodeProps.OPTIONS]: { _GLOBAL: globalOptions },
  };

  vElement[VNodeProps.CHILDREN] = isArray(props.children)
    ? props.children?.map((child) => create(child, globalOptions))
    : [create(props.children)];

  return vElement;
}

function updateVElement<T>(
  element: JSX.ComponentNode<string>,
  vElement: VElement<T>,
  globalOptions: VGlobalOptions,
) {
  const { eventRefs, props } = element;

  vElement[VNodeProps.PROPS] = <JSX.ComponentProps> props;
  vElement[VNodeProps.EVENT_REFS] = eventRefs;

  vElement[VNodeProps.CHILDREN] = track(
    vElement[VNodeProps.CHILDREN],
    isArray(props.children) ? props.children : [props.children],
    globalOptions,
  );

  return vElement;
}

function vComponent<T>(
  component: JSX.ComponentNode<JSX.Component>,
  globalOptions: VGlobalOptions,
) {
  const { type, props, key } = component;

  const vComponent: VComponent<T> = {
    type: VType.COMPONENT,
    [VNodeProps.KEY]: key,
    [VNodeProps.AST]: undefined,
    [VNodeProps.MODE]: VMode.NotCreated,
    [VNodeProps.FN]: type,
    [VNodeProps.CLEANUP]: [],
    [VNodeProps.PROPS]: props,
    [VNodeProps.OPTIONS]: { _GLOBAL: globalOptions },
  };

  scopedFn(vComponent, () => {
    typeof vNodeSignalUpdater === "function"
      ? setSubscriber(
        () => {
          const node = vComponent[VNodeProps.FN](props);
          if (node instanceof Promise) {
            throw Error("Promise/Async not supported in scoped functions");
          }
          return vComponent[VNodeProps.AST] = create(
            node,
            globalOptions,
          );
        },
        vNodeSignalUpdater(component, vComponent, globalOptions),
      )
      : vComponent[VNodeProps.AST] = create(
        assertSyncCall(vComponent[VNodeProps.FN](props)),
        globalOptions,
      );
    vComponent[VNodeProps.MODE] = VMode.Created;
  });

  return vComponent;
}

function updateVComponent<T>(
  component: JSX.ComponentNode<JSX.Component>,
  vComponent: VComponent<T>,
  globalOptions: VGlobalOptions,
) {
  const updatedNode = scopedFn(vComponent, () => {
    vComponent[VNodeProps.PROPS] = component.props;
    return typeof vNodeSignalUpdater === "function"
      ? setSubscriber(
        () => {
          return vComponent[VNodeProps.FN](vComponent[VNodeProps.PROPS]);
        },
        vNodeSignalUpdater(component, vComponent, globalOptions),
      )
      : vComponent[VNodeProps.FN](vComponent[VNodeProps.PROPS]);
  });

  vComponent[VNodeProps.AST] = update(
    assertSyncCall(updatedNode),
    vComponent[VNodeProps.AST],
    globalOptions,
    false,
  );
  return vComponent;
}

function vFragment<T>(
  fragment: JSX.ComponentNode<0> | JSX.Element[] | JSX.TemplateNode,
  globalOptions: VGlobalOptions,
): VFragment<T> {
  const vFragment: VFragment<T> = {
    type: VType.FRAGMENT,
    [VNodeProps.KEY]: keyFromNode(fragment),
    [VNodeProps.CHILDREN]: [],
    [VNodeProps.OPTIONS]: {
      _GLOBAL: globalOptions,
    },
  };

  const children: VNode<T>[] = [];
  if (isTemplateNode(fragment)) {
    for (const template of fragment.templates) {
      children.push(
        vText(template, { skipEscaping: true }),
        create(fragment.nodes?.shift(), globalOptions),
      );
    }
  } else {
    const _nodes = childrenFrom(fragment);
    const nodes = isArray(_nodes) ? _nodes : [_nodes];
    for (const node of nodes) {
      children.push(create(node, globalOptions));
    }
  }
  vFragment[VNodeProps.CHILDREN] = children;
  return vFragment;
}

function updateVFragment<T>(
  fragment: JSX.ComponentNode<0> | JSX.Element[],
  vFragment: VFragment<T>,
  globalOptions: VGlobalOptions,
): VFragment<T> {
  const _children = childrenFrom(fragment);
  const children = isArray(_children) ? _children : [_children];
  vFragment[VNodeProps.CHILDREN] = track(
    vFragment[VNodeProps.CHILDREN],
    children,
    globalOptions,
  );
  return vFragment;
}

function track<T>(
  vChildren: VNode<T>[] = [],
  children: JSX.Element[] | undefined,
  globalOptions: VGlobalOptions,
): VNode<T>[] {
  // No new nodes - remove old
  if (!children?.length) {
    return [];
  }

  // No previous nodes.
  if (!vChildren?.length) {
    return children.map((node) => create(node, globalOptions));
  }

  const vNodes = [...vChildren];

  let i = 0;
  const _children: VNode<T>[] = [];

  for (const node of children) {
    const vNode = vChildren[i];

    const vNodeKey = keyFromVNode(vNode);
    const nodeKey = keyFromNode(node);

    /*
     * Key matches, this happens in the following cases:
     * - keys are the same (update)
     * - both values are undefined (update)
     */
    if (nodeKey === vNodeKey) {
      removeByVNode(vNode, vNodes);
      _children.push(
        update(node, vNode, globalOptions, false),
      );
      i++;
      continue;
    }

    /*
     * Key does not match and node might have been moved, eighter:
     * - to a lower index
     * - to a higher index
     */
    const movedVNode = removeByKey(nodeKey, vNodes);
    if (movedVNode) {
      _children.push(update(node, movedVNode, globalOptions, false));
      i++;
      continue;
    }

    /*
     * No match found -> create a new node
     */
    _children.push(create(node, globalOptions));
    i++;
  }
  return _children;
}

export function assertSyncCall<T>(
  node: Promise<T> | T,
): T {
  if (node instanceof Promise) {
    throw new Error("Promise not allowed in sync call scope");
  }
  return node;
}

export function removeByKey<T>(
  key: number | string | undefined,
  vNodes: VNode<T>[],
): VNode<T> | undefined {
  const index = vNodes.findIndex((vNode) => {
    return keyFromVNode(vNode) === key;
  });
  return remove(index, vNodes);
}

export function removeByVNode<T>(
  vNode: VNode<T>,
  vNodes: VNode<T>[],
): VNode<T> | undefined {
  const index = vNodes.findIndex((v) => {
    return v === vNode;
  });
  return remove(index, vNodes);
}

function remove<T>(index: number, vNodes: VNode<T>[]): VNode<T> {
  if (index !== -1) {
    const movedVNodes = vNodes.splice(index, 1);
    if (!movedVNodes.length || movedVNodes.length > 1) {
      throw new Error("Exact 1 VNode expected");
    }
    return movedVNodes[0];
  }
  return undefined;
}
