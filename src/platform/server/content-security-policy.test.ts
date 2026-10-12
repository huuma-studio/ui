import { describe, expect, test } from "vite-plus/test";
import { generateCSP } from "./content-security-policy.ts";

describe(generateCSP.name, () => {
  test("should generate nonce by default", () => {
    const result = generateCSP();

    expect(result.nonce).not.toStrictEqual(undefined);
    expect(result.contentSecurityPolicy).toStrictEqual(`script-src-elem 'nonce-${result.nonce}'; script-src 'none'`);
  });

  test("should append nonce to existing script-src-elem", () => {
    const result = generateCSP({
      "default-src": ["'self'"],
      "script-src-elem": ["'self'", "https://cdn.example.com"],
    });

    expect(result.nonce).not.toStrictEqual(undefined);
    expect(result.contentSecurityPolicy).toContain("default-src 'self'");
    expect(result.contentSecurityPolicy).toContain("script-src-elem 'self' https://cdn.example.com " +
        `'nonce-${result.nonce}'`);
    expect(result.contentSecurityPolicy).toContain(`script-src 'none'`);
  });

  test(
    "should preserve existing script-src when nonce is enabled",
    () => {
      const result = generateCSP({
        "script-src": ["'self'"],
        "style-src": ["'unsafe-inline'"],
      });

      expect(result.nonce).not.toStrictEqual(undefined);
      expect(result.contentSecurityPolicy).toContain("script-src 'self'");
      expect(result.contentSecurityPolicy).toContain("style-src 'unsafe-inline'");
      expect(result.contentSecurityPolicy).toContain(`script-src-elem 'nonce-${result.nonce}'`);
    },
  );

  test("should not generate nonce when disabled", () => {
    const result = generateCSP({
      nonce: false,
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:"],
    });

    expect(result.nonce).toStrictEqual(undefined);
    expect(result.contentSecurityPolicy).toStrictEqual("default-src 'self'; img-src 'self' data:");
  });

  test(
    "should return empty policy string when nonce is disabled and no directives are provided",
    () => {
      const result = generateCSP({ nonce: false });

      expect(result.nonce).toStrictEqual(undefined);
      expect(result.contentSecurityPolicy).toStrictEqual("");
    },
  );
});
