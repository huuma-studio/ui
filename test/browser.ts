// Runs the browser tests in headless Chromium, through Playwright.
import { existsSync } from "node:fs";
import { type Browser, chromium, type Page } from "playwright-core";

/**
 * The Chromium for the browser tests: `HUUMA_CHROMIUM`, or Playwright's own
 * (`pnpm exec playwright-core install chromium`). Without either, the tests
 * are skipped, except in CI, where this throws.
 */
export function findChromium(): string | undefined {
  const path = process.env.HUUMA_CHROMIUM || chromium.executablePath();
  if (existsSync(path)) return path;
  if (process.env.CI) {
    throw new Error(
      `No Chromium at ${path}: run \`pnpm exec playwright-core install chromium\` or set HUUMA_CHROMIUM.`,
    );
  }
  return undefined;
}

export function launchChromium(executablePath: string): Promise<Browser> {
  return chromium.launch({ executablePath });
}

/**
 * Opens `url` once its scripts ran, and collects what the browser reports as
 * errors: uncaught exceptions and console errors, such as a script the
 * Content-Security-Policy blocks. The browser's own favicon request is left
 * out; the fixture has none.
 */
export async function open(
  browser: Browser,
  url: string,
): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) {
      errors.push(message.text());
    }
  });
  await page.goto(url);
  return { page, errors };
}

/** Waits for a button with exactly this text, e.g. a counter's new value. */
export function button(page: Page, text: string): Promise<void> {
  return page.getByRole("button", { name: text, exact: true }).waitFor({ timeout: 5_000 });
}
