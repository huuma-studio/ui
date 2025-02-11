import { type JSX, jsx } from "../../jsx-runtime/mod.ts";
import type { Cleanup } from "../../state/mod.ts";
import {
  create,
  isVComponent,
  setVNodeUpdater,
  snapshot,
  update,
  VNodeProps,
} from "../../v-node/mod.ts";
// TODO: Move TransferState type to general location
import type { TransferState } from "../server/parcel.ts";
import {
  attachmentRefFrom,
  createRootAttachmentRef,
} from "./diff/attachment-ref.ts";
import { diff } from "./diff/diff.ts";
import { dispatch } from "./diff/dispatch.ts";
import { hydrate } from "./diff/hydrate.ts";

type Island = {
  fn: JSX.Component;
  // TODO: Define types of the props after Signals values are handled.
  props: Record<string, unknown>;
  islandId: string;
};

export function launch(islands: Island[], transferState: TransferState) {
  setVNodeUpdater<Node>((component, vComponent, globalOptions) => {
    return {
      update: () => {
        const snapshotVNode = snapshot(vComponent);
        const updatedVNode = update(component, vComponent, globalOptions);

        if (!updatedVNode) {
          return;
        }

        const changeSet = diff({
          vNode: updatedVNode,
          previousVNode: snapshotVNode,
          attachmentRef: attachmentRefFrom(vComponent),
        });

        dispatch(changeSet);
      },
      cleanupCallback: (cleanup: Cleanup) => {
        vComponent[VNodeProps.CLEANUP].push(cleanup);
      },
    };
  });

  if (islands?.length) {
    const iterator = document.createNodeIterator(
      document.body,
      NodeFilter.SHOW_COMMENT,
      (node) => {
        return isIslandStart(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    );

    let node: Node | null;

    // deno-lint-ignore no-cond-assign
    while (node = iterator.nextNode()) {
      const attachmentRef = createRootAttachmentRef(node);

      if (isIslandStart(node)) {
        const islandId = getIslandId(node.textContent);
        if (islandId) {
          const island = removeIslandFrom(islands, islandId);
          if (island) {
            const nodes = collectIslandNodes(node, islandId);
            const element = jsx(island.fn, {
              // Todo re-construct Signals
              ...island.props,
              children: findIslandChildren({ nodes, islandId, islands }),
            });
            const vNode = create<Node>(element, {
              url: globalThis.window.location.href,
              transferState,
            });
            if (isVComponent(vNode)) {
              dispatch(hydrate(vNode, nodes, attachmentRef));
            }
          }
        }
      }
    }
  }
}

function collectIslandNodes(
  node: Comment,
  islandId: string,
): Node[] {
  let nextNode: Node | null = node;
  const nodes: Node[] = [];

  while (
    // deno-lint-ignore no-cond-assign
    nextNode = nextNode.nextSibling
  ) {
    if (
      isComment(nextNode) &&
      isIslandEnd(nextNode, islandId)
    ) {
      break;
    }
    nodes.push(nextNode);
  }

  return nodes;
}

function findIslandChildren(
  props: { islandId: string; nodes: Node[]; islands: Island[] },
): JSX.Node[] {
  const children: JSX.Node = [];
  let isChild = false;

  let childIslandId: string | undefined = undefined;
  let childIslandNodes: Node[] = [];

  let childrenFound = false;

  for (const node of props.nodes) {
    if (!isChild && isIslandStart(node)) {
      const islandId = getIslandId(node.textContent);
      if (islandId) {
        removeIslandFrom(props.islands, islandId);
      }
      removeNode(node);
      continue;
    }

    if (!isChild && isIslandEnd(node)) {
      removeNode(node);
      continue;
    }

    if (!childrenFound) {
      if (isComment(node)) {
        if (
          isChildrenStartNode(props.islandId, node.textContent)
        ) {
          isChild = true;
          removeNode(node);
          continue;
        }

        if (
          isChildrenEndNode(props.islandId, node.textContent)
        ) {
          isChild = false;
          removeNode(node);
          continue;
        }

        if (!childIslandId && isIslandStart(node) && isChild) {
          childIslandId = getIslandId(node.textContent);
          removeNode(node);
          continue;
        }

        if (
          childIslandId &&
          isIslandEnd(node, childIslandId) &&
          isChild
        ) {
          const island = removeIslandFrom(props.islands, childIslandId);
          children.push(
            jsx(island.fn, {
              ...island.props,
              children: findIslandChildren({
                islandId: childIslandId,
                islands: props.islands,
                nodes: childIslandNodes,
              }),
            }),
          );
          childIslandId = undefined;
          childIslandNodes = [];
          removeNode(node);
          continue;
        }
      }

      if (!isChild && isElement(node)) {
        // Look for nested children
        const _children = findIslandChildren({
          nodes: [...node.childNodes],
          islandId: props.islandId,
          islands: props.islands,
        });
        if (_children.length) {
          // Found children early return
          childrenFound = true;
          children.push(..._children);
        }
      }
      if (!childIslandId && isChild) {
        children.push(createChild(node, props.islands));
      } else if (!childrenFound && childIslandId && isChild) {
        childIslandNodes.push(node);
      }
    }
  }
  return children;
}

function createChild(node: Node, islands: Island[]): JSX.Node {
  if (isElement(node)) {
    // Convert element attributes to props
    const props: JSX.ElementProps = node.getAttributeNames()
      .reduce((prev, current) => {
        prev[current] = node.getAttribute(current);
        return prev;
      }, {} as Record<string, string | null>);

    const children: JSX.Node[] = [];
    let islandId: string | undefined = undefined;
    let islandChildren: Node[] = [];
    const nodes = [...node.childNodes];

    for (const childNode of nodes) {
      if (!islandId && (isElement(childNode) || isText(childNode))) {
        children.push(createChild(childNode, islands));
        continue;
      }
      if (!islandId && isIslandStart(childNode)) {
        islandId = getIslandId(childNode.textContent);
        removeNode(childNode);
        continue;
      }
      if (islandId && isIslandEnd(childNode, islandId)) {
        const island = removeIslandFrom(islands, islandId);
        children.push(
          jsx(island.fn, {
            ...island.props,
            children: findIslandChildren({
              islandId,
              islands,
              nodes: islandChildren,
            }),
          }),
        );
        islandId = undefined;
        islandChildren = [];
        removeNode(childNode);
        continue;
      }
      if (islandId) {
        islandChildren.push(node);
      }
    }

    props.children = children;
    return jsx(node.nodeName.toLowerCase(), props);
  }

  if (isText(node)) {
    return node.textContent;
  }

  return null;
}

function getIslandId(textContent: string | null): string | undefined {
  return textContent?.trim()?.split("_")[2];
}
function isIslandStart(node: Node): node is Comment {
  return isComment(node) &&
    (trim(node.textContent)?.startsWith("start_island") ?? false);
}
function isIslandEnd(node: Node, islandId?: string): node is Comment {
  if (typeof islandId === "string") {
    return isComment(node) &&
      trim(node.textContent) === `end_island_${islandId}`;
  }
  return isComment(node) &&
    (trim(node.textContent)?.startsWith("end_island") ?? false);
}
function isChildrenStartNode(
  islandId: string,
  textContent: string | null,
): boolean {
  return trim(textContent) === `start_children_${islandId}`;
}
function isChildrenEndNode(
  islandId: string,
  textContent: string | null,
): boolean {
  return trim(textContent) === `end_children_${islandId}`;
}

function isComment(node: Node | null): node is Comment {
  return (node?.nodeType === Node.COMMENT_NODE);
}
function isElement(node: Node | null): node is Element {
  return (node?.nodeType === Node.ELEMENT_NODE);
}
function isText(node: Node | null): node is Text {
  return node?.nodeType === Node.TEXT_NODE;
}

function removeIslandFrom(islands: Island[], islandId: string): Island {
  const islandIndex = islands.findIndex((island) =>
    island.islandId === islandId
  );
  const island = islands[islandIndex];
  islands.splice(islandIndex, 1);
  return island;
}
function trim(value: string | null): string | undefined {
  return value?.trim();
}

function removeNode(node?: Node) {
  node?.parentNode?.removeChild(node);
}
