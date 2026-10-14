import { homedir } from "node:os";

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

// Reuse the installed native CLI binary (self-contained; no node/PATH needed).
const CLAUDE_BIN = `${homedir()}/.local/bin/claude`;

/**
 * Runs a one-shot headless Claude prompt via the Agent SDK and returns its
 * final text. `settingSources: ['user']` loads the user's Claude config so the
 * connected claude.ai MCP connectors (e.g. Slack) are available.
 */
export async function claude(prompt: string, opts?: { model?: string }): Promise<string> {
	const options: Options = {
		model: opts?.model ?? "sonnet",
		permissionMode: "bypassPermissions",
		allowDangerouslySkipPermissions: true,
		settingSources: ["user"],
		pathToClaudeCodeExecutable: CLAUDE_BIN,
	};

	let result: string | undefined;
	for await (const message of query({ prompt, options })) {
		if (message.type === "result") {
			if (message.subtype !== "success") throw new Error(`Claude returned an error (${message.subtype}).`);
			result = message.result;
		}
	}

	if (result === undefined) throw new Error("Claude produced no result.");
	return result;
}
