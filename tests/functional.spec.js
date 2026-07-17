const { test, expect } = require('@playwright/test');

// Wordings mirrored from utils/langs/zh_TW.json (assertion source of truth).
const WORDING = {
    invalidNumber: "請輸入 4 個'不重複'的數字",
    invalidRoom: '請輸入 6 位數字房間碼',
    winHeader: '遊戲獲勝',
};

// Seed a known target so the winning / A-B paths are deterministic.
// storage.js stores currentTarget as a PLAIN string (e.g. "1234"), NOT JSON.
async function seedTarget(page, target) {
    await page.addInitScript((t) => {
        window.localStorage.setItem('currentTarget', t);
        // Ensure a fresh, non-winning game state.
        window.localStorage.setItem('currentRecord', '');
        window.localStorage.setItem('currentStep', '0');
        window.localStorage.setItem('isWinning', 'false');
    }, target);
}

// The single-player / party pages are React.lazy with a deliberate ~1s delay
// (Home.jsx). Wait for real content before asserting so we never touch Loader.
async function gotoLocal(page) {
    await page.goto('/#/local');
    await page.locator('.digit-input').first().waitFor({ state: 'visible' });
}

async function typeGuess(page, guess) {
    await page.locator('.digit-input').first().click();
    await page.keyboard.type(guess);
}

test.describe('R1 single-player guess record + invalid notice', () => {
    test('valid guess produces an "X A Y B" record row', async ({ page }) => {
        await seedTarget(page, '1234');
        await gotoLocal(page);

        await typeGuess(page, '5678'); // no overlap with 1234 -> 0 A 0 B
        await page.locator('.submit-answer-btn').click();

        // Color-coded badges split the result into spans; use toContainText and
        // keep whitespace equivalence ("0 A 0 B").
        await expect(page.locator('.record-block .record-item-result')).toContainText('0 A 0 B');
    });

    test('invalid guess (repeated digits) shows an error notice', async ({ page }) => {
        await seedTarget(page, '1234');
        await gotoLocal(page);

        await typeGuess(page, '1122'); // repeated digits -> invalid
        await page.locator('.submit-answer-btn').click();

        await expect(page.locator('.notice-block')).toContainText(WORDING.invalidNumber);
    });
});

test.describe('R2 single-player winning', () => {
    test('guessing the seeded target triggers the winning modal + step count', async ({ page }) => {
        await seedTarget(page, '1234');
        await gotoLocal(page);

        await typeGuess(page, '1234');
        await page.locator('.submit-answer-btn').click();

        const overlay = page.locator('#overlay');
        await expect(overlay).toBeVisible();
        await expect(overlay.locator('.alert-header')).toContainText(WORDING.winHeader);
        // First and only guess -> 1 step.
        await expect(overlay.locator('.alert-content')).toContainText('1');
    });
});

test.describe('R3 routing', () => {
    test('#/local is reachable', async ({ page }) => {
        await gotoLocal(page);
        await expect(page.locator('.container-main')).toBeVisible();
    });

    test('#/party is reachable', async ({ page }) => {
        await page.goto('/#/party');
        await expect(page.locator('.container-party')).toBeVisible();
    });

    test('#/party?room=123456 redirects to opening party setup with the room code', async ({ page }) => {
        await page.goto('/#/party?room=123456');
        await expect(page.locator('.opening-stage-party')).toBeVisible();
        await expect(page.locator('.roomID-input')).toHaveValue('123456');
    });
});

test.describe('R5 party smoke (connecting screen)', () => {
    // P2P (6-digit room code / QR / invite link) needs a live PeerJS broker and
    // is non-deterministic in the test env -> those belong to the R6 manual list.
    // The deterministic part we CAN assert: navigating to #/party with a nickname
    // renders the "connecting" screen (container-party + party-connecting + a
    // non-empty status message) without touching the Loader.
    test('#/party with a seeded nickname renders the connecting screen', async ({ page }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem('playerName', '測試玩家');
        });
        await page.goto('/#/party');

        const connecting = page.locator('.container-party.party-connecting');
        await expect(connecting).toBeVisible();

        const status = connecting.locator('.party-status');
        await expect(status).toBeVisible();
        await expect(status).not.toBeEmpty();
    });
});

test.describe('R4 room-code validation', () => {
    test('non 6-digit room code shows error wording and does not navigate away', async ({ page }) => {
        await page.goto('/#/');
        await page.locator('.mode-option-party').click();
        await expect(page.locator('.opening-stage-party')).toBeVisible();

        await page.locator('.roomID-input').fill('123');
        await page.locator('.party-action-join').click();

        await expect(page.locator('.opening-stage-party .wording')).toContainText(WORDING.invalidRoom);
        // Still on the opening page (party setup), not routed into /party.
        await expect(page.locator('.opening-stage-party')).toBeVisible();
    });
});
