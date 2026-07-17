const { test, expect } = require('@playwright/test');

async function seed(page, entries) {
    await page.addInitScript((data) => {
        Object.entries(data).forEach(([k, v]) => window.localStorage.setItem(k, v));
    }, entries);
}

async function gotoLocal(page) {
    await page.goto('/#/local');
    await page.locator('.digit-input').first().waitFor({ state: 'visible' });
}

test.describe('Opening page', () => {
    test('mode selection', async ({ page }) => {
        await page.goto('/#/');
        await expect(page.locator('.opening-stage-mode')).toBeVisible();
        await expect(page).toHaveScreenshot('opening-mode.png');
    });

    test('party setup', async ({ page }) => {
        await page.goto('/#/');
        await page.locator('.mode-option-party').click();
        await expect(page.locator('.opening-stage-party')).toBeVisible();
        await expect(page).toHaveScreenshot('opening-party-setup.png');
    });
});

test.describe('Single-player page', () => {
    test('initial', async ({ page }) => {
        await seed(page, { currentTarget: '1234', currentRecord: '', currentStep: '0', isWinning: 'false' });
        await gotoLocal(page);
        await expect(page.locator('.container-main')).toBeVisible();
        await expect(page).toHaveScreenshot('local-initial.png');
    });

    test('with seeded records', async ({ page }) => {
        await seed(page, {
            currentTarget: '1234',
            currentRecord: '5 6 7 8:0 A 0 B,1 3 5 7:1 A 2 B',
            currentStep: '2',
            isWinning: 'false',
        });
        await gotoLocal(page);
        await expect(page.locator('.record-block .record-item-result').first()).toBeVisible();
        await expect(page).toHaveScreenshot('local-records.png');
    });

    test('winning modal', async ({ page }) => {
        await seed(page, { currentTarget: '1234', currentRecord: '', currentStep: '0', isWinning: 'false' });
        await gotoLocal(page);
        await page.locator('.digit-input').first().click();
        await page.keyboard.type('1234');
        await page.locator('.submit-answer-btn').click();

        const overlay = page.locator('#overlay');
        await expect(overlay).toBeVisible();
        // react-spring drives the modal (JS animation) -> animations:'disabled'
        // cannot freeze it; wait for the entrance spring to settle before shooting.
        await page.waitForTimeout(1000);
        await expect(overlay).toHaveScreenshot('local-winning-modal.png');
    });
});

// Dev-only #/__screens route renders party boards + shared components with mock
// props, through the same webpack + sass-loader pipeline as production.
const SCREEN_CASES = [
    'waiting',
    'waiting-host-only',
    'coop',
    'race',
    'chat',
    'sidebar',
    'record',
    'infoblock',
    'notice',
    'notification',
    'loader',
];

test.describe('#/__screens dev boards & components', () => {
    for (const id of SCREEN_CASES) {
        test(`screen: ${id}`, async ({ page }) => {
            await page.goto('/#/__screens');
            await page.locator('[data-screen="root"]').waitFor({ state: 'visible' });
            const target = page.locator(`[data-screen="${id}"]`);
            await target.scrollIntoViewIfNeeded();
            await expect(target).toHaveScreenshot(`screen-${id}.png`);
        });
    }
});
