import { assert, describe, expect, test } from "vite-plus/test";
import { t } from "@huuma/ui/i18n";

describe(t.name, () => {
  test("should return expected text", () => {
    const value = t(
      {
        i18n: { activeLanguage: { hello: { huuma: "Hello Huuma" } } },
      },
      "hello.huuma",
    );
    expect(value).toStrictEqual("Hello Huuma");
  });

  test("should return key", () => {
    const value = t(
      {
        i18n: { activeLanguage: {} },
      },
      "hello.huuma",
    );
    expect(value).toStrictEqual("hello.huuma");
  });

  test("should return key", () => {
    const value = t(
      {
        i18n: { activeLanguage: {} },
      },
      "hello.huuma",
    );
    expect(value).toStrictEqual("hello.huuma");
  });

  test("should throw error", () => {
    assert.throws(() => {
      t({ some: "random" }, "hello.huuma");
    });
    assert.throws(() => {
      t({ i18n: { some: "random" } }, "hello.huuma");
    });
  });
});
