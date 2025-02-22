import { Fragment, type JSX, jsx } from "../../jsx-runtime/mod.ts";

// TODO: change to proper jsx as soon jsr supports it
// deno-lint-ignore no-explicit-any
export function Meta(): JSX.Element<any> | null {
  return jsx(Fragment, {
    children: [
      jsx("meta", { charset: "utf-8" }),
      jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
    ],
  });
}
