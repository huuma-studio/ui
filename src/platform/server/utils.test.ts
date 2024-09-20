import { assertEquals } from "std/assert/assert_equals.ts";

import { escapeHtml } from "./utils.ts";

Deno.test("Utils: Escape html entities", async (t) => {
  await t.step(`<div class="bg-red">Hello</div>`, () => {
    assertEquals(
      escapeHtml(`<div class="bg-red">Hello</div>`),
      "&lt;div class=&quot;bg-red&quot;&gt;Hello&lt;/div&gt;",
    );
  });
});
