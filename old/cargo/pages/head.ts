export interface Head extends Record<string, string | string[] | undefined> {
  title?: string;
  base?: string;
  link?: string[];
  meta?: string[];
  script?: string[];
  noscript?: string[];
  style?: string[];
}

let cache: Head = {};

export function head(props: Head): void {
  cache = merge(props, cache);
}

export function getHead(): Head {
  const { ...headTags } = cache;
  cache = {};
  return headTags;
}

export function merge(
  from: Record<string, string | string[] | undefined>,
  to: Record<string, string | string[] | undefined>,
) {
  const { ...copy } = to;

  for (const key in from) {
    if (typeof from[key] === "string") {
      copy[key] = from[key];
      continue;
    }
    if (Array.isArray(from[key]) && Array.isArray(to[key])) {
      copy[key] = [...<string[]> to[key], ...<string[]> from[key]];
      continue;
    }
    if (Array.isArray(from[key])) {
      copy[key] = [...<string[]> from[key]];
      continue;
    }
    if (Array.isArray(to[key])) {
      copy[key] = [...<string[]> to[key]];
    }
  }

  return copy;
}
