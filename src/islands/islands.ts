import {
  isComponentNode,
  type VComponent,
  type VNodeBeforeCreateVisitor,
} from "../v-node/mod.ts";
import { Fragment, type JSX, jsx } from "../jsx-runtime/mod.ts";
import { generateRandomString } from "../utils/generate-random-string.ts";

export interface Island {
  id: string;
  path: string;
  node: JSX.Element;
}

export function markIslands(
  islandsRef: { path: string; island: JSX.Component }[],
  islands: Island[],
): VNodeBeforeCreateVisitor {
  return (node: JSX.Element) => {
    if (
      isComponentNode(node) &&
      !islands.filter((island) => island.node === node).length
    ) {
      const island = isIsland(node, islandsRef);
      if (island) {
        islands.push(island);

        if (Array.isArray(node.props.children) && node.props.children?.length) {
          node.props.children.unshift({
            templates: [`<!-- start_children_${island.id} -->`],
            nodes: [""],
          });
          node.props.children.push({
            templates: [`<!-- end_children_${island.id} -->`],
            nodes: [""],
          });
        } else if (node.props.children) {
          node.props.children = [
            {
              templates: [`<!-- start_children_${island.id} -->`],
              nodes: [""],
            },
            node.props.children,
            {
              templates: [`<!-- end_children_${island.id} -->`],
              nodes: [""],
            },
          ];
        }

        node = jsx(Fragment, {
          children: [
            {
              templates: [`<!-- start_island_${island.id} -->`],
              nodes: [""],
            },
            node,
            {
              templates: [` <!--end_island_${island.id} -->`],
              nodes: [""],
            },
          ],
        });
      }
    }
    return node;
  };
}

function isIsland(
  node: VComponent<unknown> | JSX.ComponentNode<JSX.Component>,
  islands: { path: string; island: JSX.Component }[],
): Island | undefined {
  for (const island of islands) {
    if (island.island === node.type) {
      return {
        id: `${generateRandomString(6)}`,
        path: island.path,
        node,
      };
    }
  }
  return;
}
