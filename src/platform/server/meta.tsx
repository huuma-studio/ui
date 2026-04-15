import { Fragment, type JSX, jsx } from "../../jsx-runtime/mod.ts";
import type { Props } from "@huuma/ui";
import type { Metadata } from "@huuma/ui/server";

export interface MetaProps extends Props {
  metadata?: Metadata;
}

export function Meta({ metadata }: MetaProps): JSX.Element {
  return jsx(Fragment, {
    children: [
      jsx("meta", { charset: "utf-8" }),
      jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
      metadata?.title && jsx("title", { children: [metadata.title] }),
      metadata?.description && jsx("meta", {
        name: "description",
        content: metadata.description,
      }),
    ],
  });
}
