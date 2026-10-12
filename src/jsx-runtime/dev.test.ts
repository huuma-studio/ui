import { expect, test } from "vite-plus/test";
import { jsxDEV } from "./dev.ts";
import { Fragment, jsx } from "./jsx.ts";

test("jsxDEV builds the same node as jsx and ignores the dev arguments", () => {
  const listener = () => {};
  const call = jsxDEV as (...args: unknown[]) => unknown;
  const source = { fileName: "page.tsx", lineNumber: 1, columnNumber: 1 };

  expect(
    call("button", { "on-click": listener, children: "Save" }, "k", false, source, undefined),
  ).toStrictEqual(jsx("button", { "on-click": listener, children: "Save" }, "k"));
  expect(call(Fragment, { children: ["a", "b"] }, undefined, true, source)).toStrictEqual(
    jsx(Fragment, { children: ["a", "b"] }),
  );
});
