import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export type ShResult = {
	stdout: string;
	stderr: string;
};

/**
 * Runs a shell command and resolves with its trimmed output.
 * Rejects (non-zero exit) so the calling {@link ScriptAction} shows an alert.
 */
export async function sh(command: string, opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<ShResult> {
	const { stdout, stderr } = await execAsync(command, {
		cwd: opts?.cwd,
		env: { ...process.env, ...opts?.env },
		maxBuffer: 10 * 1024 * 1024,
	});
	return { stdout: stdout.trim(), stderr: stderr.trim() };
}
