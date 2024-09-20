import { assertEquals } from "std/assert/mod.ts";
import { getHead, head } from "./head.ts";

Deno.test("Head helper:", async (t) => {
  const headOptions = {
    title: "Hello World!",
    base: '<base href="https://cargo.wtf/"/>',
    meta: ['<meta charset="UTF-8">'],
    script: [
      '<script>console.log("Hello World!")</script>',
    ],
    link: ['<link rel="stylesheet" href="/assets/styles.css">'],
    noscript: [
      "<noscript>Your browser does not support JavaScript!</noscript>",
    ],
    style: [
      '<style">body{background-color: blue}</style>',
    ],
  };

  await t.step("Init head", () => {
    head(headOptions);
    assertEquals(
      getHead(),
      headOptions,
    );
    assertEquals(
      getHead(),
      {},
    );
  });

  await t.step("Overwrite head", () => {
    head(headOptions);
    head({
      title: "Hello Univers!",
      base: '<base href="https://cargo.wtf/en"/>',
      script: ['<script>console.log("Hello Univers!")</script>'],
      link: ['<link rel="stylesheet" href="/assets/colors.css">'],
      noscript: [
        "<noscript>Your browser does not support JavaScript!</noscript>",
      ],
      style: ['<style">html{background-color: red}</style>'],
    });

    assertEquals(
      getHead(),
      {
        title: "Hello Univers!",
        base: '<base href="https://cargo.wtf/en"/>',
        meta: ['<meta charset="UTF-8">'],
        script: [
          '<script>console.log("Hello World!")</script>',
          '<script>console.log("Hello Univers!")</script>',
        ],
        link: [
          '<link rel="stylesheet" href="/assets/styles.css">',
          '<link rel="stylesheet" href="/assets/colors.css">',
        ],
        noscript: [
          "<noscript>Your browser does not support JavaScript!</noscript>",
          "<noscript>Your browser does not support JavaScript!</noscript>",
        ],
        style: [
          '<style">body{background-color: blue}</style>',
          '<style">html{background-color: red}</style>',
        ],
      },
    );

    assertEquals(getHead(), {});
  });
});
