import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "@std/assert";
import { generateCSP } from "./content-security-policy.ts";

Deno.test(generateCSP.name, async (t) => {
  await t.step("should generate nonce by default", () => {
    const result = generateCSP();

    assertNotEquals(result.nonce, undefined);
    assertEquals(
      result.contentSecurityPolicy,
      `script-src-elem 'nonce-${result.nonce}'; script-src 'none'`,
    );
  });

  await t.step("should append nonce to existing script-src-elem", () => {
    const result = generateCSP({
      "default-src": ["'self'"],
      "script-src-elem": ["'self'", "https://cdn.example.com"],
    });

    assertNotEquals(result.nonce, undefined);
    assertStringIncludes(result.contentSecurityPolicy, "default-src 'self'");
    assertStringIncludes(
      result.contentSecurityPolicy,
      "script-src-elem 'self' https://cdn.example.com " +
        `'nonce-${result.nonce}'`,
    );
    assertStringIncludes(
      result.contentSecurityPolicy,
      `script-src 'none'`,
    );
  });

  await t.step(
    "should preserve existing script-src when nonce is enabled",
    () => {
      const result = generateCSP({
        "script-src": ["'self'"],
        "style-src": ["'unsafe-inline'"],
      });

      assertNotEquals(result.nonce, undefined);
      assertStringIncludes(result.contentSecurityPolicy, "script-src 'self'");
      assertStringIncludes(
        result.contentSecurityPolicy,
        "style-src 'unsafe-inline'",
      );
      assertStringIncludes(
        result.contentSecurityPolicy,
        `script-src-elem 'nonce-${result.nonce}'`,
      );
    },
  );

  await t.step("should not generate nonce when disabled", () => {
    const result = generateCSP({
      nonce: false,
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:"],
    });

    assertEquals(result.nonce, undefined);
    assertEquals(
      result.contentSecurityPolicy,
      "default-src 'self'; img-src 'self' data:",
    );
  });

  await t.step(
    "should return empty policy string when nonce is disabled and no directives are provided",
    () => {
      const result = generateCSP({ nonce: false });

      assertEquals(result.nonce, undefined);
      assertEquals(result.contentSecurityPolicy, "");
    },
  );
});
