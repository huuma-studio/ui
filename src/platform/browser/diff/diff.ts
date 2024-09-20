import type { VNode } from "../../../ant/mod.ts";
import type { ChangeSet } from "./dispatch.ts";
import { hydrate, toBeHydrated } from "./hydrate.ts";
import { remove, toBeRemoved } from "./remove.ts";
import { render, toBeRendered } from "./render.ts";
import { toBeUpdated, update } from "./update.ts";

interface DiffProps<T> {
  parentVNode?: VNode<T>;
  vNode?: VNode<T>;
  previousVNode?: VNode<T>;
  node?: T;
}

export function diff(props: DiffProps<Node>): ChangeSet<unknown>[] {
  const { vNode, previousVNode, parentVNode, node } = props;

  if (toBeHydrated(vNode, previousVNode, node)) {
    return hydrate(vNode, <Node>node);
  }

  if (toBeUpdated(vNode, previousVNode)) {
    return update(vNode, previousVNode);
  }

  if (
    toBeRendered({
      parentVNode,
      vNode,
    })
  ) {
    return render({
      parentVNode,
      vNode,
    });
  }

  if (toBeRemoved(vNode, previousVNode, parentVNode)) {
    return remove(previousVNode);
  }
  return [];
}
