import {
  copy,
  create,
  update,
  setVNodeUpdater,
  type VComponent,
  type VElement,
  type VNode,
  VNodeProps,
} from "../../ant/mod.ts";
import type { Cleanup } from "../../state/mod.ts";
import { jsx, type JSX } from "../../jsx-runtime/mod.ts";
import { diff } from "./diff/diff.ts";
import { dispatch } from "./diff/dispatch.ts";

interface Island {
  class: string;
  node: JSX.Component;
  props: Record<string, unknown>;
}

function init(node: Node, vNode: VNode<Node>) {
  const changeSet = diff({ node, vNode });
  dispatch(changeSet);
}

export function launch(islands: Island[]) {
  setVNodeUpdater((node, vNode, globalOptions) => {
    return {
      update: () => {
        const vNodeSnapshot = <VNode<Node>>copy(vNode);
        const updatedVNode = <VNode<Node>>(
          update(node, vNode, globalOptions, true)
        );

        const changeSet = diff({
          vNode: updatedVNode,
          previousVNode: vNodeSnapshot,
        });

        dispatch(changeSet);
      },
      unsubscribeCallback: (cleanup: Cleanup) => {
        vNode[VNodeProps.CLEANUP].push(cleanup);
      },
    };
  });

  for (const island of islands) {
    const node = document.querySelector(`.${island.class}`);
    if (node) {
      const vNode = <VComponent<Node>>(
        create<Node>(jsx(island.node, island.props))
      );
      typeof (<VElement<Node>>vNode[VNodeProps.AST])[VNodeProps.PROPS].class ===
      "string"
        ? ((<VElement<Node>>vNode[VNodeProps.AST])[VNodeProps.PROPS].class = `${
            (<VElement<Node>>vNode[VNodeProps.AST])[VNodeProps.PROPS].class
          } ${island.class}`)
        : ((<VElement<Node>>vNode[VNodeProps.AST])[VNodeProps.PROPS].class =
            island.class);
      init(node, vNode);
    }
  }
}
