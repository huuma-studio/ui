// Renders the basic fixture for comparing builds: the Vite build renders
// the pages the removed Deno pipeline rendered (spec #126), recorded in
// `test/snapshots/basic.txt`, on Node (src/vite/build.test.ts) and on Deno
// (test/deno/vite.test.ts).

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
 * - Nonces (UUIDs) become `nonce1`, `nonce2`, … in the order they appear,
 *   so a script whose nonce isn't the one its CSP header allows doesn't
 *   match.
 * - Island ids become `island1`, `island2`, … in the order they appear.
 * - Script paths become `script:<name>.js`, with the name of the island's
 *   module or `runtime`, without Vite's hash
 *   (`/assets/counter.client-Bb4Qoi4p.js`).
 */
export function comparable(text: string): string {
  const nonces = new Map<string, string>();
  text = text.replaceAll(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    (uuid) => {
      if (!nonces.has(uuid)) nonces.set(uuid, `nonce${nonces.size + 1}`);
      return nonces.get(uuid)!;
    },
  );

  const ids = [...new Set(Array.from(text.matchAll(/start_island_([a-z0-9]+)/g), (m) => m[1]))];
  ids.forEach((id, index) => {
    for (const context of ["_island_", 'islandId: "']) {
      text = text.replaceAll(`${context}${id}`, `${context}island${index + 1}`);
    }
  });

  return text.replaceAll(/"\/[^"\s]*\/([^"/\s]+)\.js"/g, (_, file: string) => {
    return `"script:${file.replace(/-[\w-]{8}$/, "")}.js"`;
  });
}
