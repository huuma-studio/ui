// Server-only code: the browser must never import it.
import { hostname } from "node:os";

export function host(): string {
  return hostname();
}
