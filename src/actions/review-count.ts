import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { countImage } from "../lib/count-image";
import { gh } from "../lib/gh";
import { ScriptAction, type ScriptContext } from "../script-action";

const REPOSITORY = "l3mpire/lempire";
const ASSIGNEE = "vincent-boulin";
const REVIEWER_TEAM = "scope-lemrich";

// Eye (Lucide "eye", MIT), shown before the first count is fetched.
const EYE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 36 36" width="144" height="144" fill="none" stroke="#58a6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
	<circle cx="12" cy="12" r="3"/>
</svg>`;

type ReviewSettings = { count?: number };
type GhUser = { login?: string };
type Pull = {
	draft?: boolean;
	requested_reviewers?: GhUser[] | null;
	requested_teams?: { slug?: string }[] | null;
	assignees?: GhUser[] | null;
};

/**
 * Counts open, non-draft PRs I need to review and shows the number on the key.
 * A PR counts when I'm a requested reviewer, or when it's assigned to
 * {@link ASSIGNEE} and the {@link REVIEWER_TEAM} team's review is requested.
 */
@action({ UUID: "com.jonasroussel.review-count" })
export class ReviewCount extends ScriptAction<ReviewSettings> {
	protected override confirmOnSuccess = false; // the updated count is the confirmation
	protected override longPressMs = 600; // hold to reset back to the eye

	protected override async longPress(ctx: ScriptContext, ev: KeyDownEvent<ReviewSettings>): Promise<void> {
		await ev.action.setSettings({}); // clear the stored count -> eye icon
		ctx.log("reset to eye");
	}

	protected override idleImage(settings: ReviewSettings): string {
		const { count } = settings;
		if (count === undefined) return EYE;
		return countImage(count, count >= 5 ? "#f85149" : count > 0 ? "#f0883e" : "#3fb950");
	}

	protected override async run(ctx: ScriptContext, ev: KeyDownEvent<ReviewSettings>): Promise<void> {
		const me = (await gh<{ login: string }>("user")).login.toLowerCase();
		const pulls = await gh<Pull[]>(`repos/${REPOSITORY}/pulls?state=open&per_page=100`, true);

		let count = 0;
		for (const pr of pulls) {
			if (pr.draft) continue;
			const iAmReviewer = (pr.requested_reviewers ?? []).some((user) => (user.login ?? "").toLowerCase() === me);
			const assignedToTarget = (pr.assignees ?? []).some((user) => (user.login ?? "").toLowerCase() === ASSIGNEE);
			const teamRequested = (pr.requested_teams ?? []).some((team) => team.slug === REVIEWER_TEAM);
			if (iAmReviewer || (assignedToTarget && teamRequested)) count++;
		}

		ctx.log(`PRs to review: ${count}`);
		await ev.action.setSettings({ count });
	}
}
