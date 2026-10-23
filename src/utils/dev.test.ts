import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

describe("devWarn", () => {
  const env = { NODE_ENV: process.env.NODE_ENV, HUUMA_ENV: process.env.HUUMA_ENV };
  let warn: ReturnType<typeof vi.spyOn>;
  // A fresh module per test: it remembers the warnings it showed.
  let dev: typeof import("./dev.ts");
  beforeEach(async () => {
    vi.resetModules();
    dev = await import("./dev.ts");
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.NODE_ENV = env.NODE_ENV;
    if (env.HUUMA_ENV === undefined) delete process.env.HUUMA_ENV;
    else process.env.HUUMA_ENV = env.HUUMA_ENV;
    vi.restoreAllMocks();
  });

  test("warns once per message", () => {
    dev.devWarn("a");
    dev.devWarn("a");
    dev.devWarn("b");
    expect(warn.mock.calls).toStrictEqual([["[huuma] a"], ["[huuma] b"]]);
  });

  test("stays quiet in production, by NODE_ENV or HUUMA_ENV", () => {
    process.env.NODE_ENV = "production";
    dev.devWarn("a");
    process.env.NODE_ENV = "development";
    process.env.HUUMA_ENV = "PROD";
    dev.devWarn("b");
    expect(warn).not.toHaveBeenCalled();
    expect(dev.isProduction()).toStrictEqual(true);
  });

  test("stops after 100 distinct warnings, saying so once", () => {
    for (let i = 0; i < 1000; i++) dev.devWarn(`attribute ${i}`);
    expect(warn).toHaveBeenCalledTimes(101);
    expect(warn.mock.calls[99]).toStrictEqual(["[huuma] attribute 99"]);
    expect(warn.mock.calls[100]).toStrictEqual([
      "[huuma] More than 100 warnings; not showing more.",
    ]);
    dev.devWarn("attribute 0");
    dev.devWarn("another");
    expect(warn).toHaveBeenCalledTimes(101);
  });
});
