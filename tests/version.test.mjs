import test from "node:test";
import assert from "node:assert/strict";
import { baseVersion, isDevVersion, nextVersion, codeOf } from "../scripts/dev-version-core.mjs";

test("codeOf formats local time as 14 digits", () => {
	assert.equal(codeOf(new Date(2026, 7, 29, 10, 23, 1)), "20260829102301");
});

test("baseVersion strips a dev code and keeps plain semver", () => {
	assert.equal(baseVersion("0.4.0.20260829102301"), "0.4.0");
	assert.equal(baseVersion("0.4.0"), "0.4.0");
});

test("isDevVersion detects a 14-digit suffix", () => {
	assert.equal(isDevVersion("0.4.0.20260829102301"), true);
	assert.equal(isDevVersion("0.4.0"), false);
	assert.equal(isDevVersion("0.4.0.123"), false);
});

test("nextVersion stamps the base with the current code", () => {
	const now = new Date(2026, 7, 29, 10, 23, 1);
	assert.equal(nextVersion("0.4.0", now), "0.4.0.20260829102301");
	assert.equal(nextVersion("0.4.0.20260829102200", now), "0.4.0.20260829102301");
});

test("nextVersion stays strictly monotonic within the same second and across minute rollover", () => {
	const now = new Date(2026, 7, 29, 10, 23, 1);
	assert.equal(nextVersion("0.4.0.20260829102301", now), "0.4.0.20260829102302");
	assert.equal(nextVersion("0.4.0.20260829102359", now), "0.4.0.20260829102400");
});

test("nextVersion is monotonic against a backdated clock", () => {
	const now = new Date(2026, 7, 29, 9, 0, 0);
	assert.equal(nextVersion("0.4.0.20260829102301", now), "0.4.0.20260829102302");
});
