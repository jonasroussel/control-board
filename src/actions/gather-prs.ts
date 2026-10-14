import { action } from "@elgato/streamdeck";
import { createWebhookObjectClient, unsafeSecretLiteral } from "@gathertown/webhook-object-sdk";

import { gh } from "../lib/gh";
import { requireSecret } from "../lib/secret";
import { ScriptAction, ScriptContext } from "../script-action";

const REPOSITORY = "l3mpire/lempire";
const REVIEWER = "vincent-boulin";
const REVIEWER_TEAM = "scope-lemrich";
const WEBHOOK_URL =
	"https://api.v2.gather.town/api/v2/hooks/spaces/7efeeeaf-d0da-4fa3-9a58-6b0eea06dbbe/objects/d8689490-d302-4856-837e-a65f95d09476";

// Stay under Gather's 60 req/min per space; one send just over a second apart.
const SEND_INTERVAL_MS = 1_100;

// GitHub mark, shown on the key at rest.
const GITHUB_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">
	<g transform="translate(28 29) scale(0.9)">
		<path fill="#ffffff" fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
	</g>
</svg>`;

type Pull = {
	number: number;
	title: string;
	html_url: string;
	draft?: boolean;
	user?: { login?: string } | null;
	requested_reviewers?: Array<{ login?: string }> | null;
	requested_teams?: Array<{ slug?: string }> | null;
};

type Review = {
	user?: { login?: string } | null;
	submitted_at?: string | null;
	state?: string;
};

type QueuedPr = { number: number; title: string; url: string };

/**
 * Open, non-draft PRs I authored in {@link REPOSITORY} that request review from
 * {@link REVIEWER} (or team {@link REVIEWER_TEAM}) and are still awaiting that
 * reviewer's verdict.
 */
async function fetchQueue(): Promise<QueuedPr[]> {
	const author = (await gh<{ login: string }>("user")).login;
	const pulls = await gh<Pull[]>(`repos/${REPOSITORY}/pulls?state=open&per_page=100`, true);
	const queue: QueuedPr[] = [];

	for (const pull of pulls) {
		const login = pull.user?.login ?? "";
		if (pull.draft || login.toLowerCase() !== author.toLowerCase()) continue;

		const requested =
			(pull.requested_reviewers ?? []).some((user) => (user.login ?? "").toLowerCase() === REVIEWER) ||
			(pull.requested_teams ?? []).some((team) => team.slug === REVIEWER_TEAM);
		if (!requested) continue;

		const reviews = await gh<Review[]>(`repos/${REPOSITORY}/pulls/${pull.number}/reviews?per_page=100`, true);
		const reviewed = reviews.some(
			(review) =>
				(review.user?.login ?? "").toLowerCase() === REVIEWER &&
				review.submitted_at != null &&
				review.state !== "PENDING",
		);
		if (!reviewed) queue.push({ number: pull.number, title: pull.title, url: pull.html_url });
	}

	return queue;
}

/**
 * Fetches my review queue and mirrors it into the Gather Inbox object: clears
 * the feed, adds one activity entry per PR (oldest first so newest lands on
 * top), then sets the counter.
 */
@action({ UUID: "com.jonasroussel.gather-prs" })
export class GatherPrs extends ScriptAction {
	protected override idleImage(): string {
		return GITHUB_MARK;
	}

	protected override async run(ctx: ScriptContext): Promise<void> {
		const client = createWebhookObjectClient({
			url: WEBHOOK_URL,
			secret: unsafeSecretLiteral(requireSecret("GATHER_WEBHOOK_SECRET")),
			preset: "inbox",
		});

		const queue = await fetchQueue();
		ctx.log(`review queue: ${queue.length} PR(s)`);

		const pong = await client.ping();
		if (pong.preset !== "inbox" || !("activity" in pong.capabilities) || !("counter" in pong.capabilities)) {
			throw new Error("Gather object is not an Inbox with activity + counter; nothing sent.");
		}

		let first = true;
		const send = async (fn: () => Promise<unknown>): Promise<void> => {
			if (!first) {
				const { promise, resolve } = Promise.withResolvers<void>();
				setTimeout(resolve, SEND_INTERVAL_MS);
				await promise;
			}
			first = false;
			await fn();
		};

		await send(() => client.activity.clear());
		for (const pr of [...queue].reverse()) {
			await send(() =>
				client.activity.add({
					id: `${REPOSITORY}#${pr.number}`,
					text: `#${pr.number} ${pr.title}`.slice(0, 500),
					url: pr.url,
				}),
			);
		}
		await send(() => client.counter.set({ count: queue.length }));
	}
}
