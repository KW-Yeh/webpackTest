import { chromium } from 'playwright';

const OUT = 'tests/__review__';
const browser = await chromium.launch();

// R2 technique: seed a known target so the winning modal is deterministic.
const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await p.addInitScript(() => {
    window.localStorage.setItem('currentTarget', '1234');
    window.localStorage.setItem('currentRecord', '');
    window.localStorage.setItem('currentStep', '0');
    window.localStorage.setItem('isWinning', 'false');
});
await p.goto('http://localhost:8080/#/local');
await p.locator('.digit-input').first().waitFor({ state: 'visible' });

await p.locator('.digit-input').first().click();
await p.keyboard.type('1234');
await p.locator('.submit-answer-btn').click();

// Wait for overlay + let react-spring (300ms) settle visually.
await p.locator('#overlay').waitFor({ state: 'visible' });
await p.waitForTimeout(1000);

// Full page: shows the modal scrim + centred night panel.
await p.screenshot({ path: `${OUT}/s5-winning.png` });

await browser.close();
console.log('captured s5');
