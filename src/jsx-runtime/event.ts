export function isEventName(a: string) {
  const p = /^on-([a-z]+)$/;
  return p.test(a);
}

export function eventName(id: string): string {
  return id.replace("on-", "");
}
