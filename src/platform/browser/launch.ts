/// <reference no-default-lib="true" />
/// <reference lib="DOM" />
/// <reference lib="deno.ns" />

import {
  create,
  setComponentUpdater,
  snapshot,
  VComponent,
  VElement,
  VNode,
  VNodeProps,
} from "../../ast.ts";
import { Cleanup } from "../../state/state.ts";
import { tag } from "../../tag.ts";
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
  setComponentUpdater((vComponent: VComponent<unknown>) => {
    return {
      update: () => {
        const vNodeSnapshot = <VComponent<Node>> snapshot(vComponent);
        //const vNode = create(vComponent);
        const changeSet = diff({
          vNode: <VComponent<Node>> vNodeSnapshot,
          previousVNode: <VComponent<Node>> vNodeSnapshot,
        });
        dispatch(changeSet);
      },
      unsubscribeCallback: (cleanup: Cleanup) => {
        vComponent[VNodeProps.CLEANUP].push(cleanup);
      },
    };
  });

  for (const island of islands) {
    const node = document.querySelector(`.${island.class}`);
    if (node) {
      const vNode = <VComponent<Node>> create<Node>(
        tag(island.node, island.props, []),
      );
      typeof (<VElement<Node>> vNode.ast).props.class === "string"
        ? (<VElement<Node>> vNode.ast).props.class = `${
          (<VElement<Node>> vNode.ast).props.class
        } ${island.class}`
        : (<VElement<Node>> vNode.ast).props.class = island.class;
      init(node, vNode);
    }
  }
}
