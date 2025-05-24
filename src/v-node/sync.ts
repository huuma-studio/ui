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
  keyFrom,
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
      vNode?.type === VType.FRAGMENT
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
          if (node instanceof Promise) throw Error("Peng");
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
    [VNodeProps.KEY]: keyFrom(fragment),
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
  nodes: JSX.Element[] | undefined,
  globalOptions: VGlobalOptions,
): VNode<T>[] {
  // No new nodes
  if (!nodes?.length) {
    return [];
  }

  // No previous nodes.
  if (!vChildren?.length) {
    return nodes.map((node) => create(node, globalOptions));
  }

  // Update
  // TODO: use key for comparision and sorting
  let i = 0;
  const children: VNode<T>[] = [];
  for (const node of nodes) {
    children.push(
      update(node, vChildren[i], globalOptions, false),
    );
    i++;
  }
  return children;
}

export function assertSyncCall<T>(
  node: Promise<T> | T,
): T {
  if (node instanceof Promise) {
    throw new Error("Promise not allowed in sync call scope");
  }
  return node;
}
