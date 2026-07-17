import { chromium } from 'playwright';

const OUT = 'tests/__review__';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

// Mode selection
await page.goto('http://localhost:8080/#/');
await page.locator('.mode-options').waitFor({ state: 'visible' });
await page.waitForTimeout(300);
await page.locator('.opening-page').screenshot({ path: `${OUT}/s3-mode-select.png` });

// Party setup
await page.locator('.mode-option-party').click();
await page.locator('.opening-stage-party').waitFor({ state: 'visible' });
await page.locator('.roomID-input').fill('123456');
await page.waitForTimeout(300);
await page.locator('.opening-page').screenshot({ path: `${OUT}/s3-party-setup.png` });

await browser.close();
console.log('captured');
