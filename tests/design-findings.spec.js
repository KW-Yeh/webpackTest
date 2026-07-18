const { test, expect } = require('@playwright/test');

async function seed(page, entries) {
    await page.addInitScript((data) => {
        Object.entries(data).forEach(([key, value]) => window.localStorage.setItem(key, value));
    }, entries);
}

async function gotoWinningModal(page) {
    await seed(page, { currentTarget: '1234', currentRecord: '', currentStep: '0', isWinning: 'false' });
    await page.goto('/#/local');
    await page.locator('.digit-input').first().waitFor({ state: 'visible' });
    await page.locator('.digit-input').first().click();
    await page.keyboard.type('1234');
    await page.locator('.submit-answer-btn').click();
    await expect(page.locator('#overlay')).toBeVisible();
    await page.waitForTimeout(350);
}

async function expectInter(locator) {
    await expect(locator).toBeVisible();
    const font = await locator.evaluate((element) => getComputedStyle(element).fontFamily);
    expect(font).toContain('Inter');
    expect(font).not.toMatch(/monospace|Consolas|Menlo/i);
}

test.describe('Design must-fix regression gates', () => {
    test('D-001 / MX-07: winning modal uses a white 16px surface', async ({ page }) => {
        await gotoWinningModal(page);
        const modal = page.locator('.alert-block-winning');
        await expect(modal).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(modal).toHaveCSS('border-top-left-radius', '16px');
    });

    test('D-002 / MX-07: winning modal is centred, unclipped, scroll-safe, and keyboard-visible', async ({ page }) => {
        await gotoWinningModal(page);
        const modal = page.locator('.modal-alert-winning');
        const viewport = page.viewportSize();
        const box = await modal.boundingBox();

        expect(box).not.toBeNull();
        expect(Math.abs((box.x + box.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(2);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        await expect.poll(() => page.evaluate(() => (
            document.documentElement.scrollWidth <= window.innerWidth && window.scrollX === 0
        ))).toBe(true);

        const button = page.locator('.next-round-btn');
        for (let attempt = 0; attempt < 12; attempt += 1) {
            if (await button.evaluate((element) => document.activeElement === element)) break;
            await page.keyboard.press('Tab');
        }
        await expect(button).toBeFocused();
        const hasVisibleFocusRing = await button.evaluate((element) => {
            const style = getComputedStyle(element);
            return element.matches(':focus-visible') &&
                ((style.outlineStyle !== 'none' && style.outlineWidth !== '0px') || style.boxShadow !== 'none');
        });
        expect(hasVisibleFocusRing).toBe(true);
    });

    test('D-003 / MX-13: party sidebar uses a white surface', async ({ page }) => {
        await page.goto('/#/__screens');
        const sidebar = page.locator('[data-screen="sidebar"] .party-sidebar');
        await expect(sidebar).toBeVisible();
        await expect(sidebar).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    });

    test('D-004 / MX-04,05,10-14: visible numeric and text controls use Inter, not monospace', async ({ page }) => {
        await seed(page, {
            currentTarget: '1234',
            currentRecord: '5 6 7 8:0 A 0 B',
            currentStep: '1',
            isWinning: 'false',
        });
        await page.goto('/#/local');
        await expectInter(page.locator('.digit-input').first()); // MX-04
        await expectInter(page.locator('.record-item-input').first()); // MX-05

        await page.goto('/#/__screens');

        // RaceBoard's own-record list is populated from local component state on
        // submit (not from the static fixture props), so a guess must be entered
        // before `.party-record-guess` exists to check its font.
        await page.locator('[data-screen="race"] .digit-input').first().click();
        await page.keyboard.type('5678');
        await page.locator('[data-screen="race"] .submit-answer-btn').click();

        const requiredInter = [
            '[data-screen="waiting"] .party-waiting-room-code', // MX-10
            '[data-screen="waiting-host-only"] .party-waiting-room-code', // MX-11
            '[data-screen="coop"] .party-record-guess', // MX-12
            '[data-screen="race"] .party-record-guess', // MX-12
            '[data-screen="sidebar"] .party-sidebar-target', // MX-13
            '[data-screen="record"] .record-item-input', // MX-14
            '[data-screen="infoblock"] .info', // MX-14
        ];
        for (const selector of requiredInter) {
            await expectInter(page.locator(selector).first());
        }
    });

    test('D-005 / MX-10-14: mobile notification leaves required content hit-testable', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile', 'The overlap gate applies to the mobile viewport.');
        await page.goto('/#/__screens');
        const toast = page.locator('.notification.show');
        await expect(toast).toBeVisible();

        const requiredContent = [
            '[data-screen="waiting"] .party-waiting-start',
            '[data-screen="waiting-host-only"] .party-waiting-start',
            '[data-screen="coop"] .submit-answer-btn',
            '[data-screen="race"] .submit-answer-btn',
            '[data-screen="chat"] .party-game-chat input',
            '[data-screen="sidebar"] .party-sidebar-target',
            '[data-screen="record"] .record-item-input',
            '[data-screen="infoblock"] .info',
        ];

        for (const selector of requiredContent) {
            const target = page.locator(selector).first();
            await target.scrollIntoViewIfNeeded();
            await expect(target).toBeVisible();
            const hitTarget = await target.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                return hit === element || element.contains(hit);
            });
            expect(hitTarget, `${selector} must remain reachable while toast is shown`).toBe(true);
        }
    });

    test('D-006 / MX-15: notification fixture renders card, icon, and reconnect wording', async ({ page }) => {
        await page.goto('/#/__screens');
        const notification = page.locator('.notification.show');
        await expect(notification).toBeVisible();
        await expect(notification).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(notification.locator('.notification-icon svg')).toBeVisible();
        await expect(notification.locator('.notification-body')).toContainText('已重新連線');
    });
});
