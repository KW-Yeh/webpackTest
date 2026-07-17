const { defineConfig, devices } = require('@playwright/test');

/**
 * Visual + functional regression config for the Notion re-skin.
 * Dev server is webpack-dev-server (HashRouter) on a pinned port 8080.
 */
module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [['list']],
    expect: {
        toHaveScreenshot: {
            // Absorb sub-pixel font hinting / anti-aliasing jitter.
            maxDiffPixelRatio: 0.01,
            animations: 'disabled',
        },
    },
    use: {
        baseURL: 'http://localhost:8080',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'desktop',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1280, height: 800 },
            },
        },
        {
            name: 'mobile',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 390, height: 844 },
            },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:8080',
        reuseExistingServer: true,
        timeout: 120000,
    },
});
