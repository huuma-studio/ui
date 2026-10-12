import { describe, expect, test } from "vite-plus/test";

import type { JSX } from "../../jsx-runtime/mod.ts";
import { renderToString } from "./mod.ts";

function Title() {
  return <h1>Hello World!</h1>;
}

function Headline(props: JSX.ComponentProps): JSX.Element {
  return <h1>{props.children}</h1>;
}

describe(renderToString.name, () => {
  test("should render headline component with text", async () => {
    expect(await renderToString(<Headline>Hello World!</Headline>, {})).toStrictEqual(
      "<h1>Hello World!</h1>",
    );
  });

  test("should render self closing component as string", async () => {
    expect(await renderToString(<Title />, {})).toStrictEqual("<h1>Hello World!</h1>");
  });

  test("should render div with text as string", async () => {
    expect(await renderToString(<div class="bg-red">Hello World</div>, {})).toStrictEqual(
      '<div class="bg-red">Hello World</div>',
    );
  });

  test("should render div with text as string", async () => {
    expect(await renderToString(<div class="bg-red">Hello World</div>, {})).toStrictEqual(
      '<div class="bg-red">Hello World</div>',
    );
  });

  test("should render numeric attributes as string", async () => {
    expect(
      await renderToString(
        <td tabindex={0} colspan={2}>
          cell
        </td>,
        {},
      ),
    ).toStrictEqual('<td tabindex="0" colspan="2">cell</td>');
  });

  test("should omit falsy boolean attributes", async () => {
    expect(
      await renderToString(
        <div>
          <input disabled={0} required={false} readonly="" />
          <p hidden={0}>text</p>
        </div>,
        {},
      ),
    ).toStrictEqual("<div><input/><p>text</p></div>");
  });

  test("should render truthy boolean attributes bare", async () => {
    expect(
      await renderToString(<input disabled={1} required readonly="readonly" />, {}),
    ).toStrictEqual("<input disabled required readonly/>");
  });

  test("should render image as string", async () => {
    expect(
      await renderToString(
        <img src="https://huuma.studio" alt="A very interesting description :-)" />,
        {},
      ),
    ).toStrictEqual('<img src="https://huuma.studio" alt="A very interesting description :-)"/>');
  });
  test("should render svg as string", async () => {
    expect(
      await renderToString(
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5.85786 5.85787C2.10714 9.60859 -1.68606e-07 14.6957 0 20C1.68606e-07 25.3043 2.10714 30.3914 5.85786 34.1421C9.60859 37.8929 14.6957 40 20 40C25.3043 40 30.3914 37.8929 34.1421 34.1421L20 20L5.85786 5.85787Z"
            fill="#3A8E51"
          />
          <circle cx="20" cy="20" r="10.6667" fill="black" fill-opacity="0.5" />
        </svg>,
        {},
      ),
    ).toStrictEqual(
      `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.85786 5.85787C2.10714 9.60859 -1.68606e-07 14.6957 0 20C1.68606e-07 25.3043 2.10714 30.3914 5.85786 34.1421C9.60859 37.8929 14.6957 40 20 40C25.3043 40 30.3914 37.8929 34.1421 34.1421L20 20L5.85786 5.85787Z" fill="#3A8E51"></path><circle cx="20" cy="20" r="10.6667" fill="black" fill-opacity="0.5"></circle></svg>`,
    );
  });
  test("should render unsafe inner html as string", async () => {
    expect(
      await renderToString(
        <div
          dangerouslySetInnerHTML={{
            __html: `<a href="https://huuma.studio">Link</a>`,
          }}
        />,
        {},
      ),
    ).toStrictEqual('<div><a href="https://huuma.studio">Link</a></div>');
  });
});
