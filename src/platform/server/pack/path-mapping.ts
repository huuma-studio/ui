import { parse } from "@std/path/parse";

export interface PathMapping {
  path: string;
  statusCode: number;
}

const pathMappings = new Map<string, PathMapping>([
  ["/!404", { path: "/*", statusCode: 404 }],
]);

export function mapPath(path: string): PathMapping {
  const parsedPath = parse(path);
  const mappedPath = pathMappings.get(`/${parsedPath.name}`);

  let statusCode = 200;

  if (mappedPath) {
    statusCode = mappedPath.statusCode;
    path = `${parsedPath.dir}${
      parsedPath.dir === "/"
        ? mappedPath.path.replace(/\//, "")
        : mappedPath.path
    }`;
  }

  /*
   * Prepare dynamic path segments for URLPattern
   * https://developer.mozilla.org/en-US/docs/Web/API/URLPattern
   */
  return { path: path.replace(/(\[(.+?)\])/g, ":$2"), statusCode };
}
