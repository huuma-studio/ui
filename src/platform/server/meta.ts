import { Fragment, type JSX, jsx } from "../../jsx-runtime/mod.ts";

// TODO: change to proper jsx as soon jsr supports it
export function Meta(): JSX.Element | null {
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
