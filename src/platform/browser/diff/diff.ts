import type { VNode } from "../../../v-node/mod.ts";
import type { ChangeSet } from "./dispatch.ts";

import { hydrate } from "./hydrate.ts";
import { render } from "./render.ts";
import { update } from "./update.ts";
import { remove } from "./remove.ts";

import type { AttachmentRef } from "./attachment-ref.ts";

interface DiffProps<T> {
  attachmentRef?: AttachmentRef;
  vNode?: VNode<T>;
  previousVNode?: VNode<T>;
  nodes?: T[];
}

export function diff(props: DiffProps<Node>): ChangeSet<unknown>[] {
  const { vNode, previousVNode, nodes, attachmentRef } = props;

  if (vNode && !previousVNode && nodes?.length && attachmentRef) {
    return hydrate(vNode, nodes, attachmentRef);
  }

  if (vNode && !previousVNode && attachmentRef) {
    return render(vNode, attachmentRef);
  }

  if (vNode && previousVNode && attachmentRef) {
    return update(vNode, previousVNode, attachmentRef);
  }

  if (vNode == null && previousVNode) {
    return remove(previousVNode);
  }

  return [];
}
