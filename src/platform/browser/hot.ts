import type { JSX } from "../../jsx-runtime/mod.ts";
import {
  isVComponent,
  isVElement,
  isVFragment,
  snapshot,
  type VComponent,
  type VGlobalOptions,
  type VNode,
  VNodeProps,
} from "../../v-node/mod.ts";
import { update } from "../../v-node/sync.ts";

import { currentAttachmentRef } from "./diff/attachment-ref.ts";
import { diff } from "./diff/diff.ts";
import { dispatch } from "./diff/dispatch.ts";

// Hot updates of islands in a dev server: an island module that changed
// replaces its component in the page's islands, keeping their state if
// the caller says the hooks didn't change.

interface MountedIsland {
  /** The element the island was hydrated from: its component, props and children. */
  element: JSX.ComponentNode<JSX.Component>;
  vNode: VComponent<Node>;
  options: VGlobalOptions;
}

const mounted: MountedIsland[] = [];
// The current component of each island module, by its browser path.
const components = new Map<string, JSX.Component>();

/** Records an island module's component by its browser path. */
export function registerIslandModule(path: string, component: JSX.Component): void {
  components.set(path, component);
}

/** Records an island that `launch()` hydrated, for hot updates. */
export function registerMountedIsland(island: MountedIsland): void {
  mounted.push(island);
}

/** Options of {@link hotReplaceIsland}. */
export interface HotReplaceOptions {
  /**
   * Keeps each island's state: its component instance re-renders with
   * `next` instead of being mounted again, so its hooks (`$signal`,
   * `$computed`, `$ref`, …) return what they returned before, by call
   * order, and the DOM is patched instead of replaced (typed input and
   * focus stay). Only safe if `next` calls the same hooks in the same
   * order; otherwise the island starts over with its initial state.
   */
  keepState?: boolean;
}

/**
 * Replaces the component of the island module at `path` (its browser
 * path, as in the `Launch` script) with `next`, in each island of the
 * page with that component, keeping props and children.
 *
 * Returns `false` if the component is used anywhere else: inside another
 * island, which renders it from its own code, or gets it as children.
 * Those keep the previous component, so the caller lets the importing
 * island update instead, or reloads the page.
 *
 * @internal Used by the Vite plugin's island hot updates; not part of the
 * public API.
 */
export function hotReplaceIsland(
  path: string,
  next: JSX.Component,
  options: HotReplaceOptions = {},
): boolean {
  const previous = components.get(path);
  // From now on, the module's component is `next`, whatever happens here.
  components.set(path, next);
  // No island of this module on the page.
  if (!previous || previous === next) return true;

  const islands = mounted.filter((island) => island.element.type === previous);
  const elsewhere = mounted.some(
    (island) => island.element.type !== previous && usesComponent(island.vNode, previous),
  );
  if (elsewhere) return false;

  for (const island of islands) {
    const element = { ...island.element, type: next };
    // The same component instance then renders `next` like any update,
    // reusing its hooks, and the diff patches its DOM. Otherwise
    // `update()` replaces it. (Before the snapshot: the diff compares
    // the components.)
    if (options.keepState) island.vNode[VNodeProps.FN] = next;
    const previousVNode = snapshot(island.vNode);
    const attachmentRef = currentAttachmentRef(island.vNode);
    const vNode = update<Node>(element, island.vNode, island.options);
    if (!isVComponent<Node>(vNode)) throw new TypeError("An island must render a component.");
    dispatch(diff({ vNode, previousVNode, attachmentRef }));
    island.element = element;
    island.vNode = vNode;
  }
  return true;
}

/** Whether a rendered tree has a component of `component`. */
export function usesComponent(vNode: VNode<unknown>, component: JSX.Component): boolean {
  if (isVComponent(vNode)) {
    return vNode[VNodeProps.FN] === component || usesComponent(vNode[VNodeProps.AST], component);
  }
  if (isVElement(vNode) || isVFragment(vNode)) {
    return (vNode[VNodeProps.CHILDREN] ?? []).some((child) => usesComponent(child, component));
  }
  return false;
}
