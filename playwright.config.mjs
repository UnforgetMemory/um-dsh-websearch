import { defineConfig, devices } from '@playwright/test';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default defineConfig({
	testDir: './tests',
	testMatch: ['**/*.spec.mjs'],
	fullyParallel: true,
	forbidOnly: false,
	retries: 0,
	workers: 1,
	reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/html' }]],
	outputDir: 'test-results/artifacts',
	use: {
		...devices['Desktop Chrome'],
		// Fix viewport so vw units are deterministic across environments.
		viewport: { width: 1280, height: 900 },
		screenshot: 'only-on-failure',
		trace: 'on-first-retry',
	},
	expect: {
		expectTimeout: 5000,
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.01,
			caret: 'hide',
		},
	},
});
