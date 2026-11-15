import { parse } from "node:path";

export interface PathMapping {
  path: string;
  statusCode: number;
  /** A not-found page, like `!404`, for `UIApp.addNotFoundPage()`. */
  notFound: boolean;
}

const pathMappings = new Map<string, PathMapping>([
  ["/!404", { path: "/*", statusCode: 404, notFound: true }],
]);

export function mapPath(path: string): PathMapping {
  const parsedPath = parse(path);
  const mappedPath = pathMappings.get(`/${parsedPath.name}`);

  let statusCode = 200;

  if (mappedPath) {
    statusCode = mappedPath.statusCode;
    path = `${parsedPath.dir}${
      parsedPath.dir === "/" ? mappedPath.path.replace(/\//, "") : mappedPath.path
    }`;
  }

  /*
   * Prepare dynamic path segments for URLPattern
   * https://developer.mozilla.org/en-US/docs/Web/API/URLPattern
   */
  return { path: path.replace(/(\[(.+?)\])/g, ":$2"), statusCode, notFound: !!mappedPath };
}
