import { defineConfig, devices } from "@playwright/test";

const playwrightPort = process.env.PLAYWRIGHT_PORT || "3000";
const playwrightUrl = process.env.PLAYWRIGHT_URL || `http://localhost:${playwrightPort}`;

/**
 * Configuración E2E Tests - Quimex
 *
 * Ejecutar:
 *   npm run test:e2e          # Una sola vez
 *   npm run test:e2e:watch    # Modo watch
 *   npm run test:e2e:ui       # UI interactivo
 */

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,

    reporter: "html",

    use: {
        baseURL: playwrightUrl,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
        },
        {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
        },
    ],

    webServer: {
        command: `npm run dev -- --port ${playwrightPort}`,
        url: playwrightUrl,
        reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
        timeout: 120000,
    },
});
