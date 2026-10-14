import { action } from "@elgato/streamdeck";

import { claude } from "../lib/claude";
import { gh } from "../lib/gh";
import { ScriptAction, ScriptContext } from "../script-action";

const REPOSITORY = "l3mpire/lempire";
const DEPLOY_CHANNEL_ID = "C01R9DZ7ZQB"; // #deploys in the l3mlist workspace
const CLAUDE_MODEL = "sonnet";

// Rocket (Lucide "rocket", MIT), shown on the key at rest.
const ROCKET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 40 40" width="144" height="144" fill="none" stroke="#56d4c4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path stroke="#f0883e" d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
	<path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
	<path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
	<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
</svg>`;

type SearchItem = { number: number; title: string; html_url: string };
type SearchResult = { items?: SearchItem[] };

/**
 * Summarises which of my PRs will ship in the next deploy, then DMs it to me on
 * Slack. "Next deploy" = my PRs merged after the last deploy notification in the
 * #deploys channel (only readable via Claude's Slack MCP connector).
 */
@action({ UUID: "com.jonasroussel.next-deploy" })
export class NextDeploy extends ScriptAction {
	protected override idleImage(): string {
		return ROCKET;
	}

	protected override async run(ctx: ScriptContext): Promise<void> {
		// 1. Time of the last deploy message (Slack only reachable through Claude).
		const raw = await claude(
			`Using the Slack MCP tools, open the Slack channel with ID ${DEPLOY_CHANNEL_ID} (workspace l3mlist) ` +
				`and read its single most recent message. Return ONLY compact JSON, no prose: ` +
				`{"iso":"<ISO-8601 UTC timestamp of that message>"}.`,
			{ model: CLAUDE_MODEL },
		);
		const { iso } = JSON.parse(raw) as { iso: string };
		ctx.log(`last deploy message: ${iso}`);

		// 2. My PRs merged after that time = what ships next.
		const query = `repo:${REPOSITORY} is:pr is:merged author:@me merged:>${iso}`;
		const search = await gh<SearchResult>(`search/issues?q=${encodeURIComponent(query)}`);
		const prs = search.items ?? [];
		ctx.log(`incoming PRs: ${prs.length}`);

		// 3. Compose the summary.
		const when = new Date(iso).toLocaleString();
		const message = prs.length
			? `:rocket: *Incoming in the next deploy* — ${prs.length} PR(s) merged since the last deploy (${when}):\n` +
				prs.map((pr) => `• <${pr.html_url}|#${pr.number}> ${pr.title}`).join("\n")
			: `:white_check_mark: Nothing new to deploy since the last deploy (${when}).`;

		// 4. DM it to myself on Slack.
		await claude(
			`Using the Slack MCP tools, send the following message as a direct message to myself ` +
				`(the authenticated Slack user's own DM). Send it verbatim, exactly as-is, with no commentary ` +
				`or extra formatting:\n\n${message}`,
			{ model: CLAUDE_MODEL },
		);
	}
}
