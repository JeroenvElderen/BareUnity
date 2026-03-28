import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const candidates = [
  process.env.SCREENSHOT_BROWSER_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/opt/google/chrome/chrome',
].filter(Boolean);

async function checkExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

console.log('Screenshot doctor');
console.log('-----------------');
console.log(`SCREENSHOT_URL=${process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:3000'}`);
console.log(`SCREENSHOT_PATH=${process.env.SCREENSHOT_PATH ?? 'artifacts/screenshots/home.png'}`);
console.log(`SCREENSHOT_BROWSER_PATH=${process.env.SCREENSHOT_BROWSER_PATH ?? '(unset)'}`);
console.log(`SCREENSHOT_BROWSER_CHANNEL=${process.env.SCREENSHOT_BROWSER_CHANNEL ?? '(unset)'}`);

let found = false;
for (const candidate of candidates) {
  const ok = await checkExecutable(candidate);
  console.log(`${ok ? '✅' : '❌'} ${candidate}`);
  found ||= ok;
}

if (!found) {
  console.log('\nNo runnable local browser executable found.');
  console.log('Try one of:');
  console.log('  npm run codex:screenshot:install');
  console.log('  SCREENSHOT_BROWSER_PATH=/path/to/chrome npm run codex:screenshot');
  console.log('  SCREENSHOT_BROWSER_CHANNEL=chrome npm run codex:screenshot');
}