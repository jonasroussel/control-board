import { action } from "@elgato/streamdeck";

import { openrouterChat } from "../lib/openrouter";
import { copySelection, paste, readClipboard, sleep, writeClipboard } from "../lib/macos";
import { ScriptAction, type ScriptContext } from "../script-action";

// Magic wand (Lucide "wand-sparkles", MIT), shown on the key at rest.
const WAND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 40 40" width="144" height="144" fill="none" stroke="#a371f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/>
	<path d="m14 7 3 3"/>
	<path d="M5 6v4"/>
	<path d="M19 14v4"/>
	<path d="M10 2v2"/>
	<path d="M7 8H3"/>
	<path d="M21 16h-4"/>
	<path d="M11 3H9"/>
</svg>`;

/** Cleans model output: drops an echoed <text> wrapper and the "AI tell" characters; keeps accents. */
function stripAiTells(text: string): string {
	return text
		.replace(/^\s*<text>\s*|\s*<\/text>\s*$/g, "") // echoed prompt wrapper
		.replace(/[\u2014\u2013]/g, "-") // em / en dash -> hyphen
		.replace(/[\u00a0\u202f]/g, " "); // non-breaking spaces -> normal space
}

const PROMPT =
	"You are lightly proofreading a casual chat message (between the <text> tags). " +
	"Fix only clear spelling mistakes and obvious grammar errors, and make as few changes as possible. " +
	"Strictly preserve the author's style: keep their exact capitalization (do NOT capitalize the start of " +
	"sentences, names, or anything they left lowercase), keep their punctuation and spacing, keep the casual tone, " +
	"and do NOT add a final period if there isn't one. Do not rephrase, reword, translate, or add content. " +
	"Keep all accented and non-ASCII letters exactly as they are (e.g. ç, é, à). " +
	"The only character to avoid is the long dash (—/–); use a normal hyphen '-' instead. " +
	"Return ONLY the corrected message, with no preamble, quotes, or commentary.";

// Only model at 46/46 in the benchmark. Minimal reasoning (it rejects "off").
const MODEL = "openai/gpt-6.1-sol";

// Pin OpenAI's "fast" tier (~215ms faster than standard, 2x price), fall back to
// standard; the price cap guarantees the 6x "ultrafast" tier is never used.
const ROUTING = {
	order: ["openai/fast", "openai"],
	allowFallbacks: true,
	maxPrice: { prompt: "4", completion: "20" },
};

/**
 * Fixes the current selection in any app: copies it, has an LLM correct spelling,
 * grammar, and punctuation (author's style preserved), then pastes the
 * result back over the selection.
 */
@action({ UUID: "com.jonasroussel.fix-text" })
export class FixText extends ScriptAction {
	protected override idleImage(): string {
		return WAND;
	}

	protected override async run(ctx: ScriptContext): Promise<void> {
		const previousClipboard = await readClipboard();

		// Empty sentinel so we can tell "nothing selected" from "copy did nothing".
		await writeClipboard("");
		await copySelection();
		await sleep(150);
		const selected = await readClipboard();

		if (!selected.trim()) {
			await writeClipboard(previousClipboard);
			throw new Error("No text selected (or missing Accessibility permission).");
		}

		const corrected = await openrouterChat({
			model: MODEL,
			system: PROMPT,
			user: `<text>\n${selected}\n</text>`,
			reasoning: { effort: "minimal" },
			provider: ROUTING,
		});
		const fixed = stripAiTells(corrected).replace(/\s+$/, "");
		ctx.log(`fixed ${selected.length} chars`);

		await writeClipboard(fixed);
		await sleep(60);
		await paste();
		await sleep(150);

		// Restore whatever the user had on the clipboard before.
		await writeClipboard(previousClipboard);
	}
}
