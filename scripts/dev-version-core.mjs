// Pure dev-version logic shared by the CLI and the test suite.
// Dev version = base semver + "." + 14-digit version code (YYYYMMDDHHMMSS,
// local time), strictly monotonic across repeated builds.
const CODE_PATTERN = /^\d{14}$/u;
const DEV_SUFFIX_PATTERN = /^(.+?)\.(\d{14})$/u;
const pad = (n, w) => String(n).padStart(w, "0");
/** Format a date as the 14-digit version code (local time). */
export function codeOf(date) {
	return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}${pad(date.getHours(), 2)}${pad(date.getMinutes(), 2)}${pad(date.getSeconds(), 2)}`;
}
/** The base (release) version: strips an existing dev code, keeps plain semver. */
export function baseVersion(version) {
	const match = DEV_SUFFIX_PATTERN.exec(version);
	return match !== null ? match[1] : version;
}
/** True when the version carries a dev code. */
export function isDevVersion(version) {
	return DEV_SUFFIX_PATTERN.test(version) && CODE_PATTERN.test(DEV_SUFFIX_PATTERN.exec(version)[2]);
}
/** Parse a 14-digit code into epoch milliseconds (local time). */
function codeToMs(code) {
	const y = Number(code.slice(0, 4));
	const mo = Number(code.slice(4, 6)) - 1;
	const d = Number(code.slice(6, 8));
	const h = Number(code.slice(8, 10));
	const mi = Number(code.slice(10, 12));
	const s = Number(code.slice(12, 14));
	return new Date(y, mo, d, h, mi, s).getTime();
}
/**
 * The next dev version: base plus a strictly monotonic code. When the current
 * version already carries a code that is not strictly older than `now` (same
 * second or a backdated clock), the code advances one second instead.
 */
export function nextVersion(current, now = new Date()) {
	const base = baseVersion(current);
	const currentCode = DEV_SUFFIX_PATTERN.exec(current)?.[2];
	let code = codeOf(now);
	if (currentCode !== undefined && CODE_PATTERN.test(currentCode)) {
		const currentMs = codeToMs(currentCode);
		const ms = codeToMs(code);
		if (ms <= currentMs) code = codeOf(new Date(currentMs + 1000));
	}
	return `${base}.${code}`;
}
