// `$computed` in a server render: nothing removes the component, so it
// must not stay subscribed to the signals it reads (see `OnRead` in
// hooks/signal.ts).
import { describe, expect, test } from "vite-plus/test";

import { $computed, $signal } from "../../hooks/signal.ts";
import { type Signal, signal } from "../../signal/mod.ts";
import { renderToString, renderToStringSync } from "./render.ts";

// A component with a computed signal that reads `shared`, as islands
// share a signal from a module. `runs.count` counts the computed's runs.
function reading(shared: Signal<number>, runs: { count: number }, fails = false) {
  return function Island() {
    const double = $computed(() => {
      runs.count++;
      return shared.get() * 2;
    });
    if (fails) throw new Error(`failed at ${double.get()}`);
    return <p>{double.get()}</p>;
  };
}

describe("$computed in a server render", () => {
  test("leaves nothing subscribed to a signal that outlives the render", async () => {
    const shared = signal(1);
    const runs = { count: 0 };
    const Island = reading(shared, runs);

    for (let i = 0; i < 20; i++) {
      expect(await renderToString(<Island />, {})).toStrictEqual("<p>2</p>");
      expect(renderToStringSync(<Island />)).toStrictEqual("<p>2</p>");
    }
    runs.count = 0;
    shared.set(2);
    expect(runs.count).toStrictEqual(0);
    expect(renderToStringSync(<Island />)).toStrictEqual("<p>4</p>");
  });

  test("leaves nothing subscribed after a render that fails", async () => {
    const shared = signal(1);
    const runs = { count: 0 };
    const Failing = reading(shared, runs, true);

    await expect(renderToString(<Failing />, {})).rejects.toThrow("failed at 2");
    expect(() => renderToStringSync(<Failing />)).toThrow("failed at 2");
    runs.count = 0;
    shared.set(2);
    expect(runs.count).toStrictEqual(0);
  });

  test("renders as text, and reads other computed signals", () => {
    function Island() {
      const count = $signal(2);
      const double = $computed(() => count.get() * 2);
      const text = $computed(() => `${count.get()} doubled is ${double.get()}`);
      return <p>{text}</p>;
    }
    expect(renderToStringSync(<Island />)).toStrictEqual("<p>2 doubled is 4</p>");
  });

  test("has the current value when a signal it reads is set during the render", () => {
    function Island({ start }: { start: number }) {
      const count = $signal(0);
      const double = $computed(() => count.get() * 2);
      const before = double.get();
      count.set(start);
      return (
        <p>
          {before} then {double}
        </p>
      );
    }
    expect(renderToStringSync(<Island start={3} />)).toStrictEqual("<p>0 then 6</p>");
  });

  test("keeps its signals apart in each component", () => {
    function Item({ value }: { value: number }) {
      const double = $computed(() => value * 2);
      const triple = $computed(() => value * 3);
      return (
        <li>
          {double} {triple}
        </li>
      );
    }
    expect(
      renderToStringSync(
        <ul>
          <Item value={1} />
          <Item value={2} />
        </ul>,
      ),
    ).toStrictEqual("<ul><li>2 3</li><li>4 6</li></ul>");
  });
});
