import { describe, expect, test } from "vite-plus/test";
import { type ContentSecurityPolicy, generateCSP } from "./content-security-policy.ts";

describe(generateCSP.name, () => {
  test("should generate nonce by default", () => {
    const result = generateCSP();

    expect(result.nonce).not.toStrictEqual(undefined);
    expect(result.contentSecurityPolicy).toStrictEqual(
      `script-src-elem 'nonce-${result.nonce}'; script-src 'none'`,
    );
  });

  test("should append nonce to existing script-src-elem", () => {
    const result = generateCSP({
      "default-src": ["'self'"],
      "script-src-elem": ["'self'", "https://cdn.example.com"],
    });

    expect(result.nonce).not.toStrictEqual(undefined);
    expect(result.contentSecurityPolicy).toContain("default-src 'self'");
    expect(result.contentSecurityPolicy).toContain(
      "script-src-elem 'self' https://cdn.example.com " + `'nonce-${result.nonce}'`,
    );
    expect(result.contentSecurityPolicy).toContain(`script-src 'none'`);
  });

  test("should preserve existing script-src when nonce is enabled", () => {
    const result = generateCSP({
      "script-src": ["'self'"],
      "style-src": ["'unsafe-inline'"],
    });

    expect(result.nonce).not.toStrictEqual(undefined);
    expect(result.contentSecurityPolicy).toContain("script-src 'self'");
    expect(result.contentSecurityPolicy).toContain("style-src 'unsafe-inline'");
    expect(result.contentSecurityPolicy).toContain(`script-src-elem 'nonce-${result.nonce}'`);
  });

  test("should not generate nonce when disabled", () => {
    const result = generateCSP({
      nonce: false,
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:"],
    });

    expect(result.nonce).toStrictEqual(undefined);
    expect(result.contentSecurityPolicy).toStrictEqual("default-src 'self'; img-src 'self' data:");
  });

  test("should return empty policy string when nonce is disabled and no directives are provided", () => {
    const result = generateCSP({ nonce: false });

    expect(result.nonce).toStrictEqual(undefined);
    expect(result.contentSecurityPolicy).toStrictEqual("");
  });

  test.each([{ sources: [] }, { sources: ["'self'", "https://cdn.example.com"] }])(
    "keeps nonces request-local when reusing script sources $sources",
    ({ sources }) => {
      const policy: ContentSecurityPolicy = { "script-src-elem": [...sources] };
      const first = generateCSP(policy);
      const second = generateCSP(policy);

      expect(second.nonce).not.toBe(first.nonce);
      expect(second.contentSecurityPolicy).toContain(`'nonce-${second.nonce}'`);
      expect(second.contentSecurityPolicy).not.toContain(`'nonce-${first.nonce}'`);
      expect(policy["script-src-elem"]).toStrictEqual(sources);
    },
  );

  test("accepts frozen shared configuration without mutating its directives", () => {
    const policy: ContentSecurityPolicy = {
      "script-src-elem": ["'self'"],
      "default-src": ["'self'"],
    };
    Object.freeze(policy["script-src-elem"]);
    Object.freeze(policy["default-src"]);
    Object.freeze(policy);

    const result = generateCSP(policy);
    expect(result.contentSecurityPolicy).toContain(
      `script-src-elem 'self' 'nonce-${result.nonce}'`,
    );
    expect(policy["script-src-elem"]).toStrictEqual(["'self'"]);
  });

  test("does not leak a nonce into another policy sharing the same sources", () => {
    const sources = ["https://cdn.example.com"];
    const enabled = generateCSP({ "script-src-elem": sources });
    const disabled = generateCSP({ nonce: false, "script-src-elem": sources });

    expect(disabled.nonce).toBeUndefined();
    expect(disabled.contentSecurityPolicy).toBe("script-src-elem https://cdn.example.com");
    expect(disabled.contentSecurityPolicy).not.toContain(enabled.nonce);
  });

  test("keeps the header bounded across repeated requests", () => {
    const policy: ContentSecurityPolicy = { "script-src-elem": ["'self'"] };
    const first = generateCSP(policy);
    for (let i = 0; i < 1_000; i++) {
      const result = generateCSP(policy);
      expect(result.contentSecurityPolicy.length).toBe(first.contentSecurityPolicy.length);
      expect(result.contentSecurityPolicy.match(/'nonce-/g)).toHaveLength(1);
    }
  });
});
