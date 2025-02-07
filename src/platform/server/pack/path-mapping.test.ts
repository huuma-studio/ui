import { assertEquals } from "@std/assert";
import { mapPath } from "./path-mapping.ts";

Deno.test(mapPath.name, async (t) => {
  await t.step('Should map "/!404"', () => {
    assertEquals(mapPath("!404").path, "/*");
    assertEquals(mapPath("/dir/!404").path, "/dir/*");
    assertEquals(mapPath("/dir/dir/!404").path, "/dir/dir/*");
  });
  await t.step("should map static routes", () => {
    assertEquals(mapPath("/file").path, "/file");
    assertEquals(mapPath("/dir/file").path, "/dir/file");
    assertEquals(mapPath("/dir/dir/file").path, "/dir/dir/file");
  });
  await t.step("should map dynamic routes", () => {
    assertEquals(mapPath("/[file]").path, "/:file");
    assertEquals(mapPath("/[dir]/[file]").path, "/:dir/:file");
    assertEquals(mapPath("/[dir]/[dir]/[file]").path, "/:dir/:dir/:file");
    assertEquals(mapPath("/[file]/!404").path, "/:file/*");
  });
});
