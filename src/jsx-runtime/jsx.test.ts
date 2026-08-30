import { assertEquals } from "@std/assert";
import { jsxAttr } from "./jsx.ts";

Deno.test("jsxAttr boolean attributes", async (t) => {
  await t.step("omits falsy boolean attributes", () => {
    assertEquals(jsxAttr("disabled", false), "");
    assertEquals(jsxAttr("disabled", undefined), "");
    assertEquals(jsxAttr("disabled", null), "");
    assertEquals(jsxAttr("disabled", 0), "");
    assertEquals(jsxAttr("disabled", ""), "");
    assertEquals(jsxAttr("disabled", NaN), "");
  });

  await t.step("emits the bare attribute name for true", () => {
    assertEquals(jsxAttr("disabled", true), {
      templates: ["disabled"],
      nodes: [""],
    });
    assertEquals(jsxAttr("readonly", true), {
      templates: ["readonly"],
      nodes: [""],
    });
  });

  await t.step("covers media and embed boolean attributes", () => {
    assertEquals(jsxAttr("disablepictureinpicture", false), "");
    assertEquals(jsxAttr("disableremoteplayback", false), "");
    assertEquals(jsxAttr("disablepictureinpicture", true), {
      templates: ["disablepictureinpicture"],
      nodes: [""],
    });
    assertEquals(jsxAttr("muted", true), {
      templates: ["muted"],
      nodes: [""],
    });
  });

  await t.step("emits the bare attribute name for any truthy value", () => {
    assertEquals(jsxAttr("checked", 1), {
      templates: ["checked"],
      nodes: [""],
    });
    assertEquals(jsxAttr("open", "yes"), {
      templates: ["open"],
      nodes: [""],
    });
  });
});

Deno.test("jsxAttr non-boolean attributes", async (t) => {
  await t.step("emits string values verbatim", () => {
    assertEquals(jsxAttr("class", "btn primary"), {
      templates: [`class="btn primary"`],
      nodes: [""],
    });
    assertEquals(jsxAttr("aria-busy", "false"), {
      templates: [`aria-busy="false"`],
      nodes: [""],
    });
    assertEquals(jsxAttr("value", ""), {
      templates: [`value=""`],
      nodes: [""],
    });
  });

  await t.step("emits the bare name for static true", () => {
    assertEquals(jsxAttr("data-active", true), {
      templates: ["data-active"],
      nodes: [""],
    });
  });

  await t.step("omits values that are neither strings nor true", () => {
    assertEquals(jsxAttr("class", false), "");
    assertEquals(jsxAttr("class", undefined), "");
    assertEquals(jsxAttr("class", 0), "");
  });
});
