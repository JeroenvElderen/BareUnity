import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:3000';
const output = process.env.SCREENSHOT_PATH ?? 'artifacts/screenshots/home.png';
const fullPage = (process.env.SCREENSHOT_FULL_PAGE ?? 'true').toLowerCase() !== 'false';
const browserPath = process.env.SCREENSHOT_BROWSER_PATH;

const launchOptions = { headless: true };

if (browserPath) {
  try {
    await access(browserPath, constants.X_OK);
    launchOptions.executablePath = browserPath;
  } catch {
    console.error(`Configured SCREENSHOT_BROWSER_PATH is not executable: ${browserPath}`);
    process.exitCode = 1;
    process.exit();
  }
}

let browser;

try {
  browser = await chromium.launch(launchOptions);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const missingBrowser =
    message.includes('Executable doesn\'t exist') ||
    message.includes('Failed to launch') ||
    message.includes('browserType.launch');

  if (missingBrowser) {
    console.error('Unable to launch Chromium for screenshots.');
    console.error('Try one of these options:');
    console.error('  1) Install Playwright Chromium: npm run codex:screenshot:install');
    console.error('  2) Point to an existing browser binary with SCREENSHOT_BROWSER_PATH=/path/to/chrome');
  }

  console.error('Original error:');
  console.error(message);
  process.exitCode = 1;
  process.exit();
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

  await mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage });

  console.log(`Saved screenshot to ${output}`);
} finally {
  await browser.close();
}