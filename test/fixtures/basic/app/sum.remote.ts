// Server-only code that must not reach the browser.
import { hostname } from "node:os";

// The `export const` form, with a type annotation.
export const add: (a: number, b: number) => Promise<number> = async (a, b) => a + b;

export async function server(): Promise<string> {
  return hostname();
}
