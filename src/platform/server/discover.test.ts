import { describe, expect, test } from "vite-plus/test";
import { type FileImport, sortPages } from "./discover.ts";

// Helper: build a FileImport with just the filePath (the only field sortPages
// reads). name/fileName are irrelevant to the sort.
function page(filePath: string): FileImport {
  return { name: "P", filePath, fileName: "page.tsx" };
}

const BASE = "app";

describe("sortPages: root page is first regardless of initial order", () => {
  // The bug: the old comparator only checked `a` for the root page, never `b`.
  // When the root page was `b`, it fell through to the alphabetical comparison
  // and could end up after the 404 catch-all — producing 404s for `/`.
  // This test verifies the fix across all permutations of input order.

  const root = page("app");
  const about = page("app/about");
  const blog = page("app/blog");
  const notFound = page("app/!404");

  // Every permutation of the four pages. If the comparator is antisymmetric
  // and transitive, all permutations must produce the same result.
  const permutations: FileImport[][] = [
    [root, about, blog, notFound],
    [notFound, blog, about, root],
    [about, root, notFound, blog],
    [blog, notFound, root, about],
    [notFound, root, about, blog],
    [root, notFound, blog, about],
    [about, blog, notFound, root],
    [blog, root, about, notFound],
  ];

  for (const [i, perm] of permutations.entries()) {
    test(`permutation ${i} puts root first`, () => {
      const sorted = sortPages([...perm], BASE);
      expect(sorted[0].filePath).toStrictEqual("app");
    });
  }
});

describe("sortPages: 404 catch-all sorts last", () => {
  test("when 404 is first in input", () => {
    const sorted = sortPages([page("app/!404"), page("app"), page("app/about")], BASE);
    expect(sorted[sorted.length - 1].filePath).toStrictEqual("app/!404");
  });

  test("when 404 is last in input", () => {
    const sorted = sortPages([page("app"), page("app/about"), page("app/!404")], BASE);
    expect(sorted[sorted.length - 1].filePath).toStrictEqual("app/!404");
  });

  test("root first, 404 last, together", () => {
    const sorted = sortPages(
      [page("app/!404"), page("app/blog"), page("app"), page("app/about")],
      BASE,
    );
    expect(sorted[0].filePath).toStrictEqual("app");
    expect(sorted[sorted.length - 1].filePath).toStrictEqual("app/!404");
  });
});

test("sortPages: result is identical across all input permutations (deterministic)", () => {
  const pages = [page("app"), page("app/about"), page("app/blog"), page("app/!404")];
  const permutations: FileImport[][] = [
    [pages[0], pages[1], pages[2], pages[3]],
    [pages[3], pages[2], pages[1], pages[0]],
    [pages[1], pages[3], pages[0], pages[2]],
    [pages[2], pages[0], pages[3], pages[1]],
  ];
  const results = permutations.map((p) => sortPages([...p], BASE).map((x) => x.filePath));
  // All permutations must yield the same order.
  for (let i = 1; i < results.length; i++) {
    expect(results[i]).toStrictEqual(results[0]);
  }
});

test("sortPages: without basePath, sorts descending alphabetically", () => {
  const sorted = sortPages([page("app/about"), page("app/blog"), page("app/!404")]);
  // Descending: blog > about > !404
  expect(sorted.map((x) => x.filePath)).toStrictEqual(["app/blog", "app/about", "app/!404"]);
});

test("sortPages: case-insensitive comparison", () => {
  const sorted = sortPages([page("app/About"), page("app/about")], BASE);
  expect(sorted[0].filePath).toStrictEqual("app/About");
  expect(sorted[1].filePath).toStrictEqual("app/about");
});
