import { type JSX, jsx } from "../../jsx-runtime/mod.ts";
import type { Props } from "../../mod.ts";

export const DEFAULT_STYLES_PATH = "/_huuma/styles";

export interface Stylesheet {
  name: string;
  content: Uint8Array<ArrayBuffer> | string;
  entrypoint: boolean;
}

interface StylesheetsProps extends Props {
  stylesheets?: Stylesheet[];
}

export function Stylesheets({ stylesheets }: StylesheetsProps): JSX.Element {
  return stylesheets?.map((stylesheet) =>
    jsx("link", {
      href: `${DEFAULT_STYLES_PATH}/${stylesheet.name}`,
      rel: "stylesheet",
    })
  );
}
