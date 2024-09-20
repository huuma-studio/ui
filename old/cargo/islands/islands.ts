import { parse } from "@std/path/parse";
import { VNodeProps, type VComponent, type VNode, VType } from "../../ant.ts";

export interface Island {
  marker: string;
  path: string;
  props: Record<string, unknown>;
}

/**
 * Find islands in vNode and wrap it with markers
 * @param {VNode} vNode - The vNode to find the islands in
 * @param {Island[]} islands - The islands to search in the vNode
 */
export function findIslands(
  vNode: VNode<unknown>,
  islands: Record<string, JSX.Component>,
): Island[] {
  const cache: Island[] = [];
  if (vNode?.type === VType.TEXT) return [];

  if (vNode?.type === VType.ELEMENT || vNode?.type === VType.FRAGMENT) {
    vNode[VNodeProps.CHILDREN]?.forEach((child) => {
      cache.push(...findIslands(child, islands));
    });
    return cache;
  }

  if (vNode?.type === VType.COMPONENT) {
    const island = isIsland(vNode, islands);
    if (island) {
      vNode[VNodeProps.AST] = {
        type: VType.FRAGMENT,
        [VNodeProps.CHILDREN]: [
          {
            type: VType.TEXT,
            [VNodeProps.TEXT]: `<!-- start_${island.marker} -->`,
            [VNodeProps.SKIP_ESCAPING]: true,
          },
          vNode[VNodeProps.AST],
          {
            type: VType.TEXT,
            [VNodeProps.TEXT]: `<!-- end_${island.marker} -->`,
            [VNodeProps.SKIP_ESCAPING]: true,
          },
        ],
        [VNodeProps.CLEANUP]: [],
        [VNodeProps.OPTIONS]: {
          _GLOBAL: vNode[VNodeProps.OPTIONS]._GLOBAL,
        },
      };
      // Don't seach for nestes islands.
      return [island];
    }
    return [...findIslands(vNode[VNodeProps.AST], islands)];
  }

  return cache;
}

function isIsland(
  vComponent: VComponent<unknown>,
  islands: Record<string, JSX.Component>,
): Island | undefined {
  for (const key in islands) {
    if (islands[key] === vComponent[VNodeProps.FN]) {
      return {
        marker: `parcel-island_${crypto.randomUUID().slice(-6)}`,
        path: parse(key).name.replaceAll("$", ""),
        props: vComponent[VNodeProps.PROPS],
      };
    }
  }
  return;
}
