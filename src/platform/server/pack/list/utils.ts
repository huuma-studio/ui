export async function generateHash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
  ).map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  ).slice(0, 8);
}
