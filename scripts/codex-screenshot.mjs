import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:3000';
const output = process.env.SCREENSHOT_PATH ?? 'artifacts/screenshots/home.png';
const fullPage = (process.env.SCREENSHOT_FULL_PAGE ?? 'true').toLowerCase() !== 'false';

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

  await mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage });

  console.log(`Saved screenshot to ${output}`);
} finally {
  await browser.close();
}