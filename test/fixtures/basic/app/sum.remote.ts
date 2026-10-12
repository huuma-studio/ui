// Server-only code that must not reach the browser.
import { hostname } from "node:os";

export async function add(a: number, b: number): Promise<number> {
  return a + b;
}

export async function server(): Promise<string> {
  return hostname();
}
