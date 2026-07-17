const { test, expect } = require('@playwright/test');

/**
 * Notion design-token gate (PLAN §6.6).
 *
 * IMPORTANT: This spec is EXPECTED TO FAIL on the current Apple-styled build.
 * It is a deliberate regression gate that only turns green after S2 (tokens).
 * Current Apple values vs. expected Notion values:
 *   - body background:  #f5f5f7 rgb(245,245,247)  ->  #f6f5f4 rgb(246,245,244)
 *   - main CTA:         #0066cc rgb(0,102,204)     ->  #0075de rgb(0,117,222)
 *   - generic input:    9999px (pill)             ->  <= 5px (Notion form, non-pill)
 */

const radiusOf = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius);

async function gotoLocal(page) {
    await page.goto('/#/local');
    await page.locator('.digit-input').first().waitFor({ state: 'visible' });
}

test('body background is Notion warm-white rgb(246, 245, 244)', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('.opening-stage-mode')).toBeVisible();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(246, 245, 244)');
});

test('body font-family contains Inter', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('.opening-stage-mode')).toBeVisible();
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toContain('Inter');
});

test('primary CTA background is Notion blue rgb(0, 117, 222)', async ({ page }) => {
    await gotoLocal(page);
    const bg = await page
        .locator('.submit-answer-btn')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(0, 117, 222)');
});

test('generic input uses a small (non-pill) radius <= 5px', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('.mode-option-party').click();
    await expect(page.locator('.roomID-input')).toBeVisible();
    const radius = await page.locator('.roomID-input').evaluate(radiusOf);
    expect(radius).toBeLessThanOrEqual(5);
});

test('.digit-input uses a small (non-pill) radius <= 5px', async ({ page }) => {
    await gotoLocal(page);
    const radius = await page.locator('.digit-input').first().evaluate(radiusOf);
    expect(radius).toBeLessThanOrEqual(5);
});
