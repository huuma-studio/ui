import { expect, test } from "vite-plus/test";
import { renderToStringSync } from "../platform/server/render.ts";

// Compiled by Oxc like app code: in tests, that's the development runtime.
test("renders JSX with a key after a spread, which compiles to createElement", () => {
  const props = { id: "a", class: "box" };
  const items = ["x", "y"].map((item) => (
    <li {...props} key={item}>
      {item}
    </li>
  ));
  expect(renderToStringSync(<ul>{items}</ul>)).toStrictEqual(
    '<ul><li id="a" class="box">x</li><li id="a" class="box">y</li></ul>',
  );
});
