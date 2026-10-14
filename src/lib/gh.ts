import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Absolute path: the GUI-launched plugin has no interactive shell PATH.
const GH_BIN = "/opt/homebrew/bin/gh";

/**
 * Calls the GitHub REST API through the `gh` CLI (reuses its stored auth).
 * With {@link paginate}, follows `--paginate --slurp` and flattens the pages.
 */
export async function gh<T = unknown>(endpoint: string, paginate = false): Promise<T> {
	const args = ["api", "--hostname", "github.com", endpoint];
	if (paginate) args.push("--paginate", "--slurp");

	let stdout: string;
	try {
		({ stdout } = await execFileAsync(GH_BIN, args, { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }));
	} catch {
		throw new Error(`GitHub request failed: ${endpoint}. Check 'gh auth status' and your network.`);
	}

	const result = JSON.parse(stdout);
	return (paginate ? (result as unknown[]).flat() : result) as T;
}
