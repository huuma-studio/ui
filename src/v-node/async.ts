import {
  childrenFrom,
  isArray,
  isComponentNode,
  isElementNode,
  isEmptyNode,
  isFragmentNode,
  isTemplateNode,
  isTextNode,
  keyFromNode,
  type VComponent,
  type VElement,
  type VFragment,
  type VGlobalOptions,
  VMode,
  type VNode,
  VNodeProps,
  vText,
  VType,
} from "./mod.ts";
import type { JSX } from "../jsx-runtime/mod.ts";
import { scopedFn } from "../hooks/scope.ts";
import { assertSyncCall } from "./sync.ts";

// deno-lint-ignore require-await
export async function create<T>(
  node: JSX.Element,
  globalOptions: VGlobalOptions,
): Promise<VNode<T>> {
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

async function vElement<T>(
  element: JSX.ComponentNode<string>,
  globalOptions: VGlobalOptions,
): Promise<VElement<T>> {
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

  const children = isArray(props.children) ? props.children : [props.children];
  vElement[VNodeProps.CHILDREN] = await Promise.all(
    children.map((child) => create<T>(child, globalOptions)),
  );

  return vElement;
}

async function vComponent<T>(
  component: JSX.ComponentNode<JSX.Component>,
  globalOptions: VGlobalOptions,
): Promise<VComponent<T>> {
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

  let node: JSX.Element;

  if (vComponent[VNodeProps.FN].constructor.name === "AsyncFunction") {
    node = await vComponent[VNodeProps.FN](props);
  } else {
    node = scopedFn(vComponent, () => {
      return assertSyncCall(vComponent[VNodeProps.FN](props));
    });
  }

  vComponent[VNodeProps.AST] = await create(
    node,
    globalOptions,
  );

  vComponent[VNodeProps.MODE] = VMode.Created;
  return vComponent;
}

async function vFragment<T>(
  fragment: JSX.ComponentNode<0> | JSX.Element[] | JSX.TemplateNode,
  globalOptions: VGlobalOptions,
): Promise<VFragment<T>> {
  const vFragment: VFragment<T> = {
    type: VType.FRAGMENT,
    [VNodeProps.KEY]: keyFromNode(fragment),
    [VNodeProps.CHILDREN]: [],
    [VNodeProps.OPTIONS]: {
      _GLOBAL: globalOptions,
    },
  };

  let children: VNode<T>[];
  if (isTemplateNode(fragment)) {
    const nodes = [...fragment.nodes];
    children = (await Promise.all(fragment.templates.map((template) => {
      const resolve = async () => {
        return [
          vText<T>(template, { skipEscaping: true }),
          await create<T>(nodes?.shift(), globalOptions),
        ];
      };
      return resolve();
    }))).flat(1);
  } else {
    const _nodes = childrenFrom(fragment);
    const nodes = isArray(_nodes) ? _nodes : [_nodes];
    children = await Promise.all(
      nodes.map((node) => create<T>(node, globalOptions)),
    );
  }
  vFragment[VNodeProps.CHILDREN] = children;
  return vFragment;
}
