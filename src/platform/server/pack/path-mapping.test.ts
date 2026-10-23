import { describe, expect, test } from "vite-plus/test";
import { mapPath } from "./path-mapping.ts";

describe(mapPath.name, () => {
  test('Should map "/!404"', () => {
    expect(mapPath("!404").path).toStrictEqual("/*");
    expect(mapPath("/dir/!404").path).toStrictEqual("/dir/*");
    expect(mapPath("/dir/dir/!404").path).toStrictEqual("/dir/dir/*");
  });
  test("should map static routes", () => {
    expect(mapPath("/file").path).toStrictEqual("/file");
    expect(mapPath("/dir/file").path).toStrictEqual("/dir/file");
    expect(mapPath("/dir/dir/file").path).toStrictEqual("/dir/dir/file");
  });
  test("should map dynamic routes", () => {
    expect(mapPath("/[file]").path).toStrictEqual("/:file");
    expect(mapPath("/[dir]/[file]").path).toStrictEqual("/:dir/:file");
    expect(mapPath("/[dir]/[dir]/[file]").path).toStrictEqual("/:dir/:dir/:file");
    expect(mapPath("/[file]/!404").path).toStrictEqual("/:file/*");
  });
});
