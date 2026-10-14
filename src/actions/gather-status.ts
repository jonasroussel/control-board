import { action } from "@elgato/streamdeck";

import { activateApp, commandKey, frontmostApp, sleep } from "../lib/macos";
import { ScriptAction, type ScriptContext } from "../script-action";

const GATHER_BUNDLE = "com.gather.GatherV2";

type Status = "active" | "busy" | "away";

// GatherV2 keyboard shortcuts and dot colours per status.
const SHORTCUT: Record<Status, string> = { active: "o", busy: "i", away: "u" };
const COLOR: Record<Status, string> = { active: "#3fb950", busy: "#e3b341", away: "#f0883e" };

/** Key image: a coloured presence dot over the status label. */
function statusImage(status: Status): string {
	const label = status.toUpperCase();
	const size = label.length > 5 ? 26 : 32; // "ACTIVE" is wider than "BUSY"/"AWAY"
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">
		<circle cx="72" cy="50" r="24" fill="${COLOR[status]}"/>
		<text x="72" y="108" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${size}" fill="#ffffff">${label}</text>
	</svg>`;
}

/**
 * One fixed-status GatherV2 button: focuses the app, sends its status shortcut,
 * and restores focus. Each status is its own key (no cycling), so there is no
 * local copy to drift out of sync.
 */
abstract class GatherStatusButton extends ScriptAction {
	protected abstract status: Status;

	protected override idleImage(): string {
		return statusImage(this.status);
	}

	protected override async run(ctx: ScriptContext): Promise<void> {
		const previous = await frontmostApp();

		await activateApp(GATHER_BUNDLE);
		await sleep(250);
		if ((await frontmostApp()) !== GATHER_BUNDLE) {
			throw new Error("Could not focus GatherV2 (is it running?).");
		}

		await commandKey(SHORTCUT[this.status]);
		await sleep(120);
		ctx.log(`status -> ${this.status}`);

		// Return focus to whatever app was in front, best effort.
		if (previous && previous !== GATHER_BUNDLE) await activateApp(previous);
	}
}

@action({ UUID: "com.jonasroussel.gather-active" })
export class GatherActive extends GatherStatusButton {
	protected override status: Status = "active";
}

@action({ UUID: "com.jonasroussel.gather-busy" })
export class GatherBusy extends GatherStatusButton {
	protected override status: Status = "busy";
}

@action({ UUID: "com.jonasroussel.gather-away" })
export class GatherAway extends GatherStatusButton {
	protected override status: Status = "away";
}
