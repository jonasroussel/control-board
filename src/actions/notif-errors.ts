import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { claude } from "../lib/claude";
import { countImage } from "../lib/count-image";
import { writeLinksPage } from "../lib/links-page";
import { notify } from "../lib/macos";
import { ScriptAction, type ScriptContext } from "../script-action";

const CLAUDE_MODEL = "sonnet";
// Data sources behind the "TopTen's squad dashboard" Notion page.
const SQUAD_ERRORS_SOURCE = "collection://95fce142-44ae-410f-8ef2-e4a716e2aa95";
const STORIES_SOURCE = "collection://02b290f7-dd2a-4543-bb29-970f34835fc8";

type Filter = Record<string, unknown>;

function property(name: string, propertyType: string, operator: string, value?: Filter): Filter {
	const filter: Filter = { type: "property", property: name, propertyType, operator };
	if (value !== undefined) filter.value = value;
	return filter;
}

function exact(value: string): Filter {
	return { type: "exact", value };
}

function group(operator: "and" | "or", filters: Filter[]): Filter {
	return { type: "group", operator, filters };
}

/** {@link name} is empty or contains me (the Notion user Claude's connector is logged in as). */
function unownedOrMine(name: string): Filter {
	return group("or", [
		property(name, "person", "is_empty"),
		property(name, "person", "person_contains", { type: "relative", value: "me" }),
	]);
}

// Open "Squad Error Events" of the enrichment squad (tagged Lemrich in practice), unowned or mine.
const ERRORS_FILTER = group("and", [
	group("or", [
		property("Squad", "multi_select", "enum_contains", exact("Lemrich")),
		property("Squad", "multi_select", "enum_contains", exact("Enrichment")),
	]),
	property("Lifecycle", "select", "enum_is_not", exact("Done")),
	property("Lifecycle", "select", "enum_is_not", exact("Rotten")),
	unownedOrMine("Owner"),
]);

// Open enrichment/lemrich "Slow queries" stories with no dev, or with me as dev.
const SLOW_QUERIES_FILTER = group("and", [
	property("Title", "title", "string_contains", exact("Slow query on")),
	group("or", [
		property("Title", "title", "string_contains", exact("enrichment")),
		property("Title", "title", "string_contains", exact("lemrich")),
	]),
	...["✅ Success", "❌ Failed", "🍅 Rotten", "Archived Success"].map((lifecycle) =>
		property("Lifecycle", "select", "enum_is_not", exact(lifecycle)),
	),
	unownedOrMine("Dev"),
]);

const PROMPT = `Using the Notion MCP tool notion-query-data-sources (read-only, never modify anything), run exactly these two queries in "rows" mode with limit 100, following has_more until all rows are fetched. Do not add or drop conditions.

Query A: data_source_url "${SQUAD_ERRORS_SOURCE}", filter:
${JSON.stringify(ERRORS_FILTER)}

Query B: data_source_url "${STORIES_SOURCE}", filter:
${JSON.stringify(SLOW_QUERIES_FILTER)}

Return ONLY compact JSON, no prose, no code fence:
{"errors":[{"title":"<row title>","url":"<row page URL>"}],"slowQueries":[{"title":"<row title>","url":"<row page URL>"}]}`;

// Bug (Lucide "bug", MIT), shown before the first check.
const BUG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 40 40" width="144" height="144" fill="none" stroke="#ff7b72" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>
	<path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/>
	<path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/>
	<path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>
</svg>`;

type Row = { title: string; url: string };
type QueryResult = { errors: Row[]; slowQueries: Row[] };
type NotifErrorsSettings = { count?: number };

/**
 * Checks the squad dashboard in Notion for open enrichment dev-notif errors
 * (Squad Error Events and Slow queries) that nobody owns yet or that I own. Shows the count
 * on the key (the bug icon when there are none); when above zero, a
 * notification opens a page with the links.
 */
@action({ UUID: "com.jonasroussel.notif-errors" })
export class NotifErrors extends ScriptAction<NotifErrorsSettings> {
	protected override confirmOnSuccess = false; // a non-zero count is its own confirmation
	protected override longPressMs = 600; // hold to reset back to the bug

	protected override async longPress(ctx: ScriptContext, ev: KeyDownEvent<NotifErrorsSettings>): Promise<void> {
		await ev.action.setSettings({});
		ctx.log("reset to bug");
	}

	protected override idleImage(settings: NotifErrorsSettings): string {
		return settings.count ? countImage(settings.count, "#f85149") : BUG;
	}

	protected override async run(ctx: ScriptContext, ev: KeyDownEvent<NotifErrorsSettings>): Promise<void> {
		const raw = await claude(PROMPT, { model: CLAUDE_MODEL });
		const { errors, slowQueries } = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as QueryResult;
		const count = errors.length + slowQueries.length;
		ctx.log(`errors: ${errors.length}, slow queries: ${slowQueries.length}`);
		await ev.action.setSettings({ count });
		if (!count) {
			await ev.action.showOk(); // the key stays on the bug icon, so confirm the check ran
			return;
		}

		const links = [
			...errors.map((row) => ({ url: row.url, label: "Error", text: row.title })),
			...slowQueries.map((row) => ({ url: row.url, label: "Slow query", text: row.title })),
		];
		const summary = `${errors.length} error(s), ${slowQueries.length} slow query(ies) to fix`;
		const pageUrl = await writeLinksPage("notif-errors", "Notif errors to fix", summary, links);
		await notify("Notif errors to fix", summary, links.map((link) => link.text).join("\n"), pageUrl);
	}
}
