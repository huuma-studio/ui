import type { JSX } from "../../jsx-runtime/mod.ts";
import type { Props } from "../../mod.ts";

export const DEFAULT_STYLES_PATH = "/_huuma/styles";

export interface Stylesheet {
  name: string;
  content: Uint8Array<ArrayBuffer>;
}

interface StylesheetsProps extends Props {
  styleSheets: Stylesheet[];
}

export function Stylesheets({ styleSheets }: StylesheetsProps): JSX.Element {
  return (
    <>
      {styleSheets.map((stylesheet) => (
        <link
          href={`${DEFAULT_STYLES_PATH}/${stylesheet.name}`}
          rel="stylesheet"
        />
      ))}
    </>
  );
}
