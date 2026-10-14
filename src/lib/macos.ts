import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// pbcopy/pbpaste use the locale's encoding; the GUI-launched plugin has none,
// so force UTF-8 or accented characters get mangled (ç -> √ß).
const UTF8_ENV = { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" };

/** Reads the macOS clipboard as text. */
export async function readClipboard(): Promise<string> {
	const { stdout } = await execFileAsync("/usr/bin/pbpaste", [], { maxBuffer: 16 * 1024 * 1024, env: UTF8_ENV });
	return stdout;
}

/** Writes text to the macOS clipboard. */
export function writeClipboard(text: string): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const proc = execFile("/usr/bin/pbcopy", [], { env: UTF8_ENV }, (err) => (err ? reject(err) : resolve()));
	proc.stdin?.end(text, "utf8");
	return promise;
}

/** Sends a Command+key shortcut to the frontmost app via System Events. */
export async function commandKey(key: string): Promise<void> {
	await execFileAsync("/usr/bin/osascript", [
		"-e",
		`tell application "System Events" to keystroke "${key}" using command down`,
	]);
}

/** Bundle id of the frontmost app (e.g. "com.gather.GatherV2"). */
export async function frontmostApp(): Promise<string> {
	const { stdout } = await execFileAsync("/usr/bin/osascript", [
		"-e",
		"tell application \"System Events\" to get bundle identifier of first application process whose frontmost is true",
	]);
	return stdout.trim();
}

/** Brings the app with the given bundle id to the front. */
export async function activateApp(bundleId: string): Promise<void> {
	await execFileAsync("/usr/bin/open", ["-b", bundleId]);
}

/** Copies the current selection (Command+C) in the frontmost app. */
export function copySelection(): Promise<void> {
	return commandKey("c");
}

/** Pastes the clipboard (Command+V) into the frontmost app. */
export function paste(): Promise<void> {
	return commandKey("v");
}

/** Resolves after {@link ms} milliseconds. */
export function sleep(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}
