import { Fragment, type JSX, jsx } from "../../jsx-runtime/mod.ts";

export function Meta(): JSX.Element {
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
