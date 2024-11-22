import {
  copy,
  update,
  setVNodeUpdater,
  type VNode,
  VNodeProps,
} from "../../v-node/mod.ts";
import type { Cleanup } from "../../state/mod.ts";
import type { Island } from "../../islands/islands.ts";

import { diff } from "./diff/diff.ts";
import { dispatch } from "./diff/dispatch.ts";

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
}
