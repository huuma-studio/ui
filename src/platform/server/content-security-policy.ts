/*
 * Based on the W3C spec: https://w3c.github.io/webappsec-csp/
 */
export type ContentSecurityPolicyType =
  | "child-src"
  | "connect-src"
  | "default-src"
  | "font-src"
  | "frame-src"
  | "img-src"
  | "manifest-src"
  | "media-src"
  | "object-src"
  | "script-src"
  | "script-src-elem"
  | "script-src-attr"
  | "style-src"
  | "style-src-elem"
  | "style-src-attr"
  | "form-action"
  | "frame-ancestors";

export type ContentSecurityPolicy =
  & {
    [Key in ContentSecurityPolicyType]?: string[];
  }
  & { nonce?: boolean };

type ContentSecurityPolicyResult = {
  nonce: string | undefined;
  contentSecurityPolicy: string;
};

export function generateCSP(
  policy?: ContentSecurityPolicy,
): ContentSecurityPolicyResult {
  // Default to nonce=true if not provided
  const { nonce = true, ..._policy } = policy ?? {};

  const result: ContentSecurityPolicyResult = {
    nonce: undefined,
    contentSecurityPolicy: "",
  };

  if (nonce) {
    const _nonce = crypto.randomUUID();

    if (Array.isArray(_policy["script-src-elem"])) {
      _policy["script-src-elem"].push(`'nonce-${_nonce}'`);
    } else {
      _policy["script-src-elem"] = [`'nonce-${_nonce}'`];
    }

    if (!Array.isArray(_policy["script-src"])) {
      _policy["script-src"] = [`'none'`];
    }

    result.nonce = _nonce;
  }

  result.contentSecurityPolicy = Object.entries(_policy).map(([key, value]) =>
    `${key} ${value.join(" ")}`
  ).join("; ");

  return result;
}
