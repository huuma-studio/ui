import { $signal } from "@huuma/ui/hooks/signal";

export default function Counter({ start = 0 }: { start?: number }) {
  const count = $signal(start);
  return <button on-click={() => count.set(count.get() + 1)}>{count}</button>;
}
