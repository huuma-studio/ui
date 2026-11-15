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

  test("interpolates a value literally, even one with $ patterns", () => {
    const value = t(
      {
        i18n: {
          activeLanguage: {
            price: "Cost: {{amount}} today, {{amount}} tomorrow",
          },
        },
      },
      "price",
      { amount: "10 > $& / $` / $' / $$" },
    );
    // Previously "$&" became the match itself, "$`" the label before it,
    // "$'" what follows it, and "$$" a single "$": ordinary values
    // corrupted the label.
    expect(value).toStrictEqual(
      "Cost: 10 > $& / $` / $' / $$ today, 10 > $& / $` / $' / $$ tomorrow",
    );
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
