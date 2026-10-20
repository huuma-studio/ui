import {
  isVComponent,
  isVElement,
  isVFragment,
  isVText,
  type VElement,
  type VNode,
  VNodeProps,
  type VText,
} from "../../../v-node/mod.ts";
import { toText } from "../../../utils/text.ts";

type Leaf = VElement<Node> | VText<Node>;

/**
 * Prepares server-rendered `nodes` for hydrating `vNodes`, so each text
 * vNode gets a text node of its own (spec #132).
 *
 * The browser parses text that the server wrote next to other text as one
 * text node, and empty text as no node at all. Hydration would then take
 * the next node, often an element, as the text's node and re-create it.
 * So for each run of adjacent text vNodes:
 *
 * - a text node that holds exactly the run's text is split into one node
 *   per vNode (empty ones included), keeping the first node;
 * - where the run is empty and the server wrote no text node, empty text
 *   nodes are inserted before the next node.
 *
 * `nodes` is changed in place. It stops at the first difference to what
 * the server would have rendered (a different element or text, or raw
 * HTML) and leaves the rest to hydration's own fallbacks.
 */
export function alignText(vNodes: VNode<Node>[], nodes: Node[]): void {
  const leaves: Leaf[] = [];
  if (!collectLeaves(vNodes, leaves)) return;

  let index = 0;
  for (let i = 0; i < leaves.length;) {
    const leaf = leaves[i];
    const node = nodes[index];

    if (isVElement(leaf)) {
      if (node?.nodeName.toLowerCase() !== leaf[VNodeProps.TAG].toLowerCase()) return;
      index++;
      i++;
      continue;
    }

    const run: string[] = [];
    while (i < leaves.length && isVText(leaves[i])) {
      run.push(toText((<VText<Node>>leaves[i])[VNodeProps.TEXT]));
      i++;
    }
    const text = run.join("");

    if (node instanceof Text) {
      if (node.data !== text) return;
      nodes.splice(index, 1, ...split(node, run));
    } else if (text === "" && node?.parentNode) {
      const empty = run.map(() => new Text(""));
      for (const textNode of empty) node.parentNode.insertBefore(textNode, node);
      nodes.splice(index, 0, ...empty);
    } else {
      // Empty text at the end: hydration creates the nodes, as there's
      // nothing left to take. Any other text: the server rendered
      // something else.
      return;
    }
    index += run.length;
  }
}

/**
 * The texts and elements `vNodes` render, in order, through components
 * and fragments. False if it meets raw HTML, which may stand for any
 * number of nodes.
 */
function collectLeaves(vNodes: VNode<Node>[], leaves: Leaf[]): boolean {
  for (const vNode of vNodes) {
    if (isVText(vNode)) {
      if (vNode[VNodeProps.SKIP_ESCAPING]) return false;
      leaves.push(vNode);
    } else if (isVElement(vNode)) {
      leaves.push(vNode);
    } else if (isVComponent(vNode)) {
      if (!collectLeaves([vNode[VNodeProps.AST]], leaves)) return false;
    } else if (isVFragment(vNode)) {
      if (!collectLeaves(vNode[VNodeProps.CHILDREN] ?? [], leaves)) return false;
    }
  }
  return true;
}

/** Splits `node` into one text node per text in `texts`. */
function split(node: Text, texts: string[]): Text[] {
  const nodes = [node];
  let last = node;
  for (const text of texts.slice(0, -1)) {
    last = last.splitText(text.length);
    nodes.push(last);
  }
  return nodes;
}
