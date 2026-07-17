import { chromium } from 'playwright';

const OUT = 'tests/__review__';

const browser = await chromium.launch();

// --- Initial state (fresh single-player page) ---
const p1 = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await p1.addInitScript(() => {
    window.localStorage.setItem('currentTarget', '1234');
    window.localStorage.setItem('currentRecord', '');
    window.localStorage.setItem('currentStep', '0');
    window.localStorage.setItem('isWinning', 'false');
    window.localStorage.setItem('currentHighestScore', '--');
    window.localStorage.setItem('averageScore', '0');
    window.localStorage.setItem('playingHistory', '');
});
await p1.goto('http://localhost:8080/#/local');
await p1.locator('.digit-input').first().waitFor({ state: 'visible' });
// Show focus + fill feedback: type two digits into the first inputs.
await p1.locator('.digit-input').first().click();
await p1.keyboard.type('12');
await p1.waitForTimeout(300);
await p1.locator('.container-main').screenshot({ path: `${OUT}/s4-initial.png` });

// --- Populated state (seeded records + scores) ---
const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await p2.addInitScript(() => {
    window.localStorage.setItem('currentTarget', '1234');
    window.localStorage.setItem(
        'currentRecord',
        '5 6 7 8:0 A 0 B,1 5 6 7:1 A 0 B,1 2 4 3:2 A 2 B,1 2 3 8:3 A 0 B'
    );
    window.localStorage.setItem('currentStep', '4');
    window.localStorage.setItem('isWinning', 'false');
    window.localStorage.setItem('currentHighestScore', '5');
    window.localStorage.setItem('averageScore', '7');
    window.localStorage.setItem('playingHistory', '5,9');
});
await p2.goto('http://localhost:8080/#/local');
await p2.locator('.record-item').first().waitFor({ state: 'visible' });
await p2.waitForTimeout(400);
await p2.locator('.container-main').screenshot({ path: `${OUT}/s4-records.png` });

await browser.close();
console.log('captured s4');
