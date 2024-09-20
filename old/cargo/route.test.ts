import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { setServerContext } from "./context.ts";
import { Route } from "./route.ts";
Deno.test("Route", async (t) => {
  await t.step("should throw scope error (url)", () => {
    assertThrows(
      () => {
        Route.url();
      },
      Error,
      "No request scope found!",
    );
  });
  await t.step("should throw server side error (navigate)", () => {
    setServerContext({ request: new Request("https://cargo.wtf") } as any);
    assertThrows(
      () => {
        Route.navigate("https://cargo.wtf/en");
      },
      Error,
      "Not allowed to navigate on the server side",
    );
    setServerContext(undefined);
  });
  await t.step("should return href of request", () => {
    setServerContext({ request: new Request("https://cargo.wtf") } as any);
    assertEquals(Route.url().href, "https://cargo.wtf/");
    setServerContext({ request: new Request("https://cargo.wtf/en") } as any);
    assertEquals(Route.url().href, "https://cargo.wtf/en");
    setServerContext(undefined);
  });
});
