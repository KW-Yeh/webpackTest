import { chromium } from 'playwright';

const OUT = 'tests/__review__';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

// Dev-only visual route hosts the shared-component mocks (Notice / Notification
// / InfoBlock / Loader) under stable data-screen containers.
await p.goto('http://localhost:8080/#/__screens');
await p.locator('[data-screen="loader"]').waitFor({ state: 'visible' });

const shots = [
    ['loader', 's7-loader.png'],
    ['notice', 's7-notice.png'],
    ['notification', 's7-notification.png'],
    ['infoblock', 's7-infoblock.png'],
];

for (const [screen, file] of shots) {
    await p.locator(`[data-screen="${screen}"]`).screenshot({
        path: `${OUT}/${file}`,
        animations: 'disabled', // freeze Loader @keyframes + toast fade
    });
}

// ErrorBoundary fallback is not mocked in Screens; inject its exact markup into
// the same page (main.scss already loaded) to snapshot the .error-fallback skin.
const fallbackBox = await p.evaluateHandle(() => {
    const box = document.createElement('div');
    box.className = 'error-fallback';
    box.innerHTML = '<p>頁面載入失敗，請重新整理頁面。</p>';
    box.style.margin = '40px';
    document.body.prepend(box);
    return box;
});
await fallbackBox.asElement().screenshot({ path: `${OUT}/s7-error-fallback.png` });

await browser.close();
console.log('captured s7');
