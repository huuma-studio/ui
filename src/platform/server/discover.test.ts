import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FileImport, listIslands, listPages, sortPages } from "./discover.ts";

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

test("sortPages: finds the root page when the base path has capitals", () => {
  const sorted = sortPages([page("/Users/me/app/!404"), page("/Users/me/app")], "/Users/me/app");
  expect(sorted[0].filePath).toStrictEqual("/Users/me/app");
});

test("sortPages: case-insensitive comparison", () => {
  const sorted = sortPages([page("app/About"), page("app/about")], BASE);
  expect(sorted[0].filePath).toStrictEqual("app/About");
  expect(sorted[1].filePath).toStrictEqual("app/about");
});

describe("discovery in a routes tree", () => {
  let root: string;
  const files = [
    "App/layout.tsx",
    "App/page.tsx",
    "App/middleware.ts",
    "App/about/page.tsx",
    "App/(marketing)/pricing/page.tsx",
    "App/blog/layout.tsx",
    "App/blog/[slug]/page.tsx",
    "App/!404/page.tsx",
    "App/counter.client.tsx",
    "components/nested/like.client.tsx",
    "App/notes.md",
  ];

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "huuma-discover-"));
    for (const file of files) {
      await mkdir(join(root, file, ".."), { recursive: true });
      await writeFile(join(root, file), "");
    }
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("listPages maps pages to routes with their layouts and middlewares", async () => {
    // Capitals in the routes path, as in an absolute path under /Users.
    const app = join(root, "App");
    const routes = await listPages(app);
    const byRoute = Object.fromEntries(
      routes.pages.map(({ page, layouts, middlewares }) => [
        page.routePath,
        { layouts: layouts.length, middlewares: middlewares.length },
      ]),
    );

    expect(byRoute).toStrictEqual({
      "/": { layouts: 1, middlewares: 1 },
      "/about": { layouts: 1, middlewares: 1 },
      // Route groups in parentheses don't appear in the path.
      "/pricing": { layouts: 1, middlewares: 1 },
      "/blog/[slug]": { layouts: 2, middlewares: 1 },
      "/!404": { layouts: 1, middlewares: 1 },
    });
    // The root page registers first and the 404 catch-all last.
    expect(routes.pages[0].page.routePath).toStrictEqual("/");
    expect(routes.pages[routes.pages.length - 1].page.routePath).toStrictEqual("/!404");
  });

  test("listIslands finds every .client.tsx file below the path", async () => {
    const islands = await listIslands(root);
    expect(
      islands.map(({ filePath, fileName }) => join(filePath, fileName).slice(root.length + 1)),
    ).toStrictEqual(["App/counter.client.tsx", "components/nested/like.client.tsx"]);
  });
});
