export const BUILD_ID = Deno.env.get("DENO_DEPLOYMENT_ID") ??
  crypto.randomUUID().replaceAll("-", "");
