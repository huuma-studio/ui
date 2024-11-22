import { parse } from "@std/path/parse";
import {
  VNodeProps,
  type VComponent,
  type VNode,
  VType,
} from "../v-node/mod.ts";
import type { JSX } from "../jsx-runtime/mod.ts";
import { generateRandomString } from "../utils/generate-random-string.ts";

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
  islands: { path: string; island: JSX.Component }[],
): Island[] {
  const _islands: Island[] = [];
  if (vNode?.type === VType.TEXT) return [];

  if (vNode?.type === VType.ELEMENT || vNode?.type === VType.FRAGMENT) {
    vNode[VNodeProps.CHILDREN]?.forEach((child) => {
      _islands.push(...findIslands(child, islands));
    });
    return _islands;
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
      return [island, ...findIslands(vNode[VNodeProps.AST], islands)];
    }
    return [...findIslands(vNode[VNodeProps.AST], islands)];
  }

  return _islands;
}

function isIsland(
  vComponent: VComponent<unknown>,
  islands: { path: string; island: JSX.Component }[],
): Island | undefined {
  for (const island of islands) {
    if (island.island === vComponent[VNodeProps.FN]) {
      return {
        marker: `parcel-island_${generateRandomString(6)}`,
        path: parse(island.path).name,
        props: vComponent[VNodeProps.PROPS],
      };
    }
  }
  return;
}
