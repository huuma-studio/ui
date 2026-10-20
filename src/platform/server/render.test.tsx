import { describe, expect, test } from "vite-plus/test";

import { jsx, jsxAttr, jsxEscape, jsxTemplate, type JSX } from "../../jsx-runtime/mod.ts";
import { signal } from "../../signal/mod.ts";
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
      '<script>x = "</\\u0073cript><\\u0073cript>alert(1)</\\u0053CRIPT>"</script>',
    );
    // After `<!--`, an opening `<script` would make the browser ignore the
    // element's real end.
    expect(render(<script>{'s = "<!--<script>"'}</script>)).toStrictEqual(
      '<script>s = "<!--<\\u0073cript>"</script>',
    );
    expect(render(<style>{"</style><script>alert(1)</script>"}</style>)).toStrictEqual(
      "<style><\\/style><script>alert(1)</script></style>",
    );
  });

  test("makes <script> and <style> safe as a whole, not child by child", () => {
    // A closing tag split across children only appears once they're joined.
    expect(
      render(
        <style>
          {"</sty"}
          {"le><img src=x onerror=alert(1)>"}
        </style>,
      ),
    ).toStrictEqual("<style><\\/style><img src=x onerror=alert(1)></style>");
    expect(
      render(
        <script>
          {"</scr"}
          {"ipt><img src=x onerror=alert(1)>"}
        </script>,
      ),
    ).toStrictEqual("<script></\\u0073cript><img src=x onerror=alert(1)></script>");
    // Text in fragments and components is raw too.
    const Code = () => <>{"if (a < b && c) {}"}</>;
    expect(
      render(
        <script>
          <>{"if (a < b && c) {}"}</>
        </script>,
      ),
    ).toStrictEqual("<script>if (a < b && c) {}</script>");
    expect(
      render(
        <script>
          <Code />
        </script>,
      ),
    ).toStrictEqual("<script>if (a < b && c) {}</script>");
    expect(render(<style>{["nav > a {}", " b > i {}"]}</style>)).toStrictEqual(
      "<style>nav > a {} b > i {}</style>",
    );
  });

  test("escapes <style> and <script> text inside <svg> and <math>", () => {
    // There the HTML parser reads their content as markup, so raw text could
    // add elements (and decodes entities, so escaped CSS still works).
    const untrusted = "<img src=x onerror=alert(1)>";
    const Wrapped = () => <>{untrusted}</>;
    expect(
      render(
        <svg>
          <style>{untrusted}</style>
          <style>
            <>{untrusted}</>
          </style>
          <style>
            <Wrapped />
          </style>
        </svg>,
      ),
    ).toStrictEqual(
      "<svg>" + "<style>&lt;img src=x onerror=alert(1)&gt;</style>".repeat(3) + "</svg>",
    );
    expect(render(jsx("math", { children: jsx("script", { children: "a < b" }) }))).toStrictEqual(
      "<math><script>a &lt; b</script></math>",
    );
    // <foreignObject> holds HTML again, and <svg> nested in it is foreign again.
    expect(
      render(
        <svg>
          <foreignObject>
            <style>{"a > b {}"}</style>
            <svg>
              <style>{"a > b {}"}</style>
            </svg>
          </foreignObject>
        </svg>,
      ),
    ).toStrictEqual(
      "<svg><foreignObject><style>a > b {}</style><svg><style>a &gt; b {}</style></svg></foreignObject></svg>",
    );
  });

  test("writes true and false like the browser runtime", () => {
    expect(
      render(<div aria-expanded={false} data-open={true} title={true} lang={false} />),
    ).toStrictEqual('<div aria-expanded="false" data-open="true" title></div>');
  });
});

// The values of the probe in spec #132: a signal renders its value like
// the same value written statically.
const TEXT_VALUES: JSX.SignalValue[] = [null, undefined, false, true, 0, "", "x"];

describe("rendering signal text", () => {
  test.each(TEXT_VALUES)("renders a signal holding %o like the static value", (value) => {
    expect(renderToStringSync(<p>{signal(value)}</p>)).toStrictEqual(
      renderToStringSync(<p>{value}</p>),
    );
  });

  test("renders null, undefined and booleans as nothing", () => {
    for (const value of [null, undefined, false, true]) {
      expect(renderToStringSync(<p>{signal(value)}</p>)).toStrictEqual("<p></p>");
    }
  });
});

// Templates as the precompile transform builds them: static HTML strings
// from the source code, with dynamic children in `jsxEscape()` and dynamic
// attributes in `jsxAttr()`.
describe("rendering precompiled templates", () => {
  test("escapes dynamic children once", () => {
    const untrusted = "<img src=x onerror=alert(1)> & co";
    expect(renderToStringSync(jsxTemplate(["<p>", "</p>"], jsxEscape(untrusted)))).toStrictEqual(
      "<p>&lt;img src=x onerror=alert(1)&gt; &amp; co</p>",
    );
    // Numbers, null, arrays and elements, like JSX children.
    expect(
      renderToStringSync(
        jsxTemplate(["<ul>", "</ul>"], jsxEscape([1, null, false, <li>{"a < b"}</li>])),
      ),
    ).toStrictEqual("<ul>1<li>a &lt; b</li></ul>");
  });

  test("writes the static strings as they are", () => {
    expect(
      renderToStringSync(jsxTemplate(['<p class="x">&amp; ', "</p>"], jsxEscape("&"))),
    ).toStrictEqual('<p class="x">&amp; &amp;</p>');
  });

  test("checks dynamic attributes with jsxAttr()", () => {
    const template = jsxTemplate(
      ["<a ", " ", ">", "</a>"],
      jsxAttr("href", "javascript:alert(1)"),
      jsxAttr("title", '"><script>alert(1)</script>'),
      jsxEscape("link"),
    );
    expect(renderToStringSync(template)).toStrictEqual(
      '<a  title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">link</a>',
    );
  });
});
