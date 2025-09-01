import { t } from "@huuma/ui/i18n";
import { assertEquals } from "@std/assert/equals";
import { assertThrows } from "@std/assert/throws";

Deno.test(t.name, async ({ step }) => {
  await step("should return expected text", () => {
    const value = t({
      i18n: { activeLanguage: { hello: { huuma: "Hello Huuma" } } },
    }, "hello.huuma");
    assertEquals(value, "Hello Huuma");
  });

  await step("should return key", () => {
    const value = t({
      i18n: { activeLanguage: {} },
    }, "hello.huuma");
    assertEquals(value, "hello.huuma");
  });

  await step("should return key", () => {
    const value = t({
      i18n: { activeLanguage: {} },
    }, "hello.huuma");
    assertEquals(value, "hello.huuma");
  });

  await step("should throw error", () => {
    assertThrows(() => {
      t({ some: "random" }, "hello.huuma");
    });
    assertThrows(() => {
      t({ i18n: { "some": "random" } }, "hello.huuma");
    });
  });
});
