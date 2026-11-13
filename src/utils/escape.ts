const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes the characters with a meaning in HTML, like `escape()` from @std/html. */
export function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => entities[char]);
}
