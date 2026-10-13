// Renders the basic fixture for comparing builds: the Vite build and the
// Deno pipeline must render the same pages (spec #126), and the Vite build
// keeps rendering them once the Deno pipeline is gone. Both tests match
// `test/snapshots/basic.txt`.

/** A fetch handler, such as a built app. */
export type Handler = {
  fetch(
    request: Request,
    connection: { remoteAddr: { transport: "tcp"; hostname?: string; port?: number } },
  ): Response | Promise<Response>;
};

// The remote endpoint of `app/sum.remote.ts`. Both builds must name it the
// same, or the call fails.
const SUM_ENDPOINT = "/_huuma/remote/bb2fb3f5/sum.remote";

const requests: [label: string, request: () => Request][] = [
  ...["/", "/about", "/remote", "/missing"].map((path): [string, () => Request] => [
    `GET ${path}`,
    () => new Request(`http://localhost${path}`),
  ]),
  [
    `POST ${SUM_ENDPOINT} add(1, 2)`,
    () =>
      new Request(`http://localhost${SUM_ENDPOINT}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ remoteFunction: "add", args: [1, 2] }),
      }),
  ],
];

/**
 * Sends the fixture's requests to `app` and returns status, headers and body
 * of each response, without what's random (nonces, island ids) or named by
 * the build (script paths).
 */
export async function renderFixture(app: Handler): Promise<string> {
  const sections: string[] = [];
  for (const [label, request] of requests) {
    const response = await app.fetch(request(), {
      remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 },
    });
    const headers = [...response.headers].map(([name, value]) => `${name}: ${value}`).sort();
    sections.push(
      [`=== ${label}`, String(response.status), ...headers, "", await response.text()].join("\n"),
    );
  }
  return comparable(`${sections.join("\n\n")}\n`);
}

/**
 * - Nonces (UUIDs) become `NONCE`.
 * - Island ids become `island1`, `island2`, … in the order they appear.
 * - Script paths become `script:<name>.js`, with the name of the island's
 *   module or `runtime`: without the Deno pipeline's hash directory and hash
 *   prefix (`/_huuma/0d2d03b4/be9d3798-counter.client.js`) and Vite's hash
 *   suffix (`/assets/counter.client-Bb4Qoi4p.js`).
 */
export function comparable(text: string): string {
  text = text.replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "NONCE");

  const ids = [...new Set(Array.from(text.matchAll(/start_island_([a-z0-9]+)/g), (m) => m[1]))];
  ids.forEach((id, index) => {
    for (const context of ["_island_", 'islandId: "']) {
      text = text.replaceAll(`${context}${id}`, `${context}island${index + 1}`);
    }
  });

  return text.replaceAll(/"\/[^"\s]*\/([^"/\s]+)\.js"/g, (_, file: string) => {
    const name = file.replace(/^[0-9a-f]{8}-/, "").replace(/-[\w-]{8}$/, "");
    return `"script:${name === "huuma_ui_launch" ? "runtime" : name}.js"`;
  });
}
