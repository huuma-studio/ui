import { describe, expect, test } from "vite-plus/test";

import { jsx, type JSX } from "../../jsx-runtime/mod.ts";
import { renderToString } from "./mod.ts";
import { renderToStringSync } from "./render.ts";

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

// Spec #131's probe: what the renderer makes of markup from outside the code.
describe("rendering untrusted values", () => {
  const render = (node: JSX.Element) => renderToStringSync(node);

  test("escapes text, attribute values and textarea content", () => {
    expect(render(<p>{"<img src=x onerror=alert(1)>"}</p>)).toStrictEqual(
      "<p>&lt;img src=x onerror=alert(1)&gt;</p>",
    );
    expect(render(<p title={'"><script>alert(1)</script>'} />)).toStrictEqual(
      '<p title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"></p>',
    );
    expect(render(<textarea>{"</textarea><script>alert(1)</script>"}</textarea>)).toStrictEqual(
      "<textarea>&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;</textarea>",
    );
  });

  test("leaves out spread props with invalid attribute names", () => {
    const attributes = {
      "x onmouseover=alert(1) y": "1",
      "a><script>alert(1)</script": "x",
      'a"b': "c",
      "data-ok": "1",
    };
    expect(render(<div {...attributes} />)).toStrictEqual('<div data-ok="1"></div>');
  });

  test("throws on an invalid tag name", () => {
    const tag = "img src=x onerror=alert(1)";
    expect(() => render(jsx(tag, {}))).toThrow(
      'Can\'t render the element "img src=x onerror=alert(1)": invalid tag name.',
    );
    expect(render(jsx("my-element", {}))).toStrictEqual("<my-element></my-element>");
  });

  test("leaves out javascript: URLs in URL attributes", () => {
    expect(render(<a href="javascript:alert(1)">x</a>)).toStrictEqual("<a>x</a>");
    expect(render(<a href={" \u0001JaVa\tScRiPt:alert(1)"}>x</a>)).toStrictEqual("<a>x</a>");
    expect(render(<iframe src="javascript:alert(1)" />)).toStrictEqual("<iframe></iframe>");
    expect(render(<form action="javascript:alert(1)" />)).toStrictEqual("<form></form>");
    expect(render(<button formaction="javascript:alert(1)" />)).toStrictEqual("<button></button>");
    // Other URLs, and the word in other attributes, stay.
    expect(render(<a href="/javascript:x">x</a>)).toStrictEqual('<a href="/javascript:x">x</a>');
    expect(render(<a title="javascript:alert(1)">x</a>)).toStrictEqual(
      '<a title="javascript:alert(1)">x</a>',
    );
  });

  test("leaves out string event handlers", () => {
    expect(render(<div onclick="alert(1)" onMouseOver="alert(1)" />)).toStrictEqual("<div></div>");
  });

  test("writes <script> and <style> text as it is, but can't be closed early", () => {
    expect(render(<style>{"a > b { content: '&'; }"}</style>)).toStrictEqual(
      "<style>a > b { content: '&'; }</style>",
    );
    expect(render(<script>{"if (a < b && c) {}"}</script>)).toStrictEqual(
      "<script>if (a < b && c) {}</script>",
    );
    expect(render(<script>{'x = "</script><script>alert(1)</SCRIPT>"'}</script>)).toStrictEqual(
      '<script>x = "<\\/script><script>alert(1)<\\/SCRIPT>"</script>',
    );
    expect(render(<style>{"</style><script>alert(1)</script>"}</style>)).toStrictEqual(
      "<style><\\/style><script>alert(1)</script></style>",
    );
  });

  test("writes true and false like the browser runtime", () => {
    expect(
      render(<div aria-expanded={false} data-open={true} title={true} lang={false} />),
    ).toStrictEqual('<div aria-expanded="false" data-open="true" title></div>');
  });
});
