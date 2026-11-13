import { $signal } from "@huuma/ui/hooks/signal";

import { add } from "../sum.remote.ts";

// Calls a remote function from the browser.
export default function Sum() {
  const sum = $signal(0);
  return <button on-click={async () => sum.set(await add(sum.get(), 2))}>{sum}</button>;
}
