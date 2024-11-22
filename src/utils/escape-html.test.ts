import { assertEquals } from "@std/assert/equals";
import { escapeHtml } from "./escape-html.ts";

Deno.test("Utils: Escape html entities", async (t) => {
  await t.step(`<div class="bg-red">Hello</div>`, () => {
    assertEquals(
      escapeHtml(`<div class="bg-red">Hello</div>`),
      "&lt;div class=&quot;bg-red&quot;&gt;Hello&lt;/div&gt;",
    );
  });
});
