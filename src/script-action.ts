import streamDeck, { KeyDownEvent, KeyUpEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

/** Encode an SVG string as a data URI Stream Deck can render via setImage. */
function svgDataUri(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Rotating spoke spinner (after SVG Spinners "gooey-balls"/"90-ring" family by
// n3r4zzurr0, MIT). Stream Deck can't run SMIL, so the fixed comet of spokes is
// re-rendered rotated one discrete step per frame and pushed via setImage.
const SPIN_COLOR = "#ffffff";
const SPIN_STEPS = 12; // discrete 30-degree positions
const SPIN_PERIOD_MS = 750; // one full revolution
// Trailing comet: 7 spokes at rising opacity, the brightest leading.
const SPIN_SPOKES = [0.14, 0.29, 0.43, 0.57, 0.71, 0.86, 1] as const;

/** One frame of the spinner, the comet rotated to discrete {@link step}. */
function spinnerFrame(step: number): string {
	const spokes = SPIN_SPOKES.map(
		(opacity, i) =>
			`<rect x="11" y="1" width="2" height="5" rx="1" fill="${SPIN_COLOR}" opacity="${opacity}" transform="rotate(${i * 30} 12 12)"/>`,
	).join("");
	const angle = step * (360 / SPIN_STEPS);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 48 48" width="144" height="144"><g transform="rotate(${angle} 12 12)">${spokes}</g></svg>`;
}

/**
 * Handle passed to a script's {@link ScriptAction.run} method for talking back
 * to the key while the script runs.
 */
export type ScriptContext = {
	/** Set the key title. */
	title(text: string): Promise<void>;
	/** Write an info line to the plugin log (./<uuid>.sdPlugin/logs). */
	log(...args: unknown[]): void;
};

/**
 * Base class for a script key. Subclass it, set an {@link idleImage} or
 * {@link label}, and implement {@link run}. The key press lifecycle is handled:
 *
 *   press -> pulse spinner -> run() -> checkmark (resolved) | alert (threw)
 */
export abstract class ScriptAction<S extends JsonObject = JsonObject> extends SingletonAction<S> {
	/** Idle key image (SVG). Override to render from settings; undefined = manifest image. */
	protected idleImage(_settings: S): string | undefined {
		return undefined;
	}

	/** Idle key title, used when {@link idleImage} returns undefined. */
	protected label = "";

	/** Show a checkmark on success. Disable when the run itself updates the key. */
	protected confirmOnSuccess = true;

	/** When set, holding the key this many ms runs {@link longPress} instead of {@link run}. */
	protected longPressMs?: number;

	private pressTimer?: NodeJS.Timeout;
	private pendingDown?: KeyDownEvent<S>;
	private longPressHandled = false;

	/** Your script. Throw to signal failure (shows the alert triangle). */
	protected abstract run(ctx: ScriptContext, ev: KeyDownEvent<S>): Promise<void>;

	/** Optional long-press handler; enable by setting {@link longPressMs}. */
	protected longPress(_ctx: ScriptContext, _ev: KeyDownEvent<S>): Promise<void> {
		return Promise.resolve();
	}

	override onWillAppear(ev: WillAppearEvent<S>): void | Promise<void> {
		return this.restoreIdle(ev);
	}

	override async onKeyDown(ev: KeyDownEvent<S>): Promise<void> {
		if (this.longPressMs === undefined) {
			await this.execute(ev, (ctx) => this.run(ctx, ev), this.confirmOnSuccess);
			return;
		}

		// Long-press aware: the hold timer fires longPress; releasing first runs run().
		this.longPressHandled = false;
		this.pendingDown = ev;
		this.pressTimer = setTimeout(() => {
			this.longPressHandled = true;
			void this.execute(ev, (ctx) => this.longPress(ctx, ev), false);
		}, this.longPressMs);
	}

	override async onKeyUp(_ev: KeyUpEvent<S>): Promise<void> {
		if (this.longPressMs === undefined) return;
		clearTimeout(this.pressTimer);
		const down = this.pendingDown;
		this.pendingDown = undefined;
		if (this.longPressHandled || !down) return;
		await this.execute(down, (ctx) => this.run(ctx, down), this.confirmOnSuccess);
	}

	private async execute(
		ev: KeyDownEvent<S>,
		task: (ctx: ScriptContext) => Promise<void>,
		confirm: boolean,
	): Promise<void> {
		const stopSpinner = this.startSpinner(ev);
		const ctx: ScriptContext = {
			title: (text) => ev.action.setTitle(text),
			log: (...args) => streamDeck.logger.info(`[${this.constructor.name}]`, ...args),
		};

		try {
			await task(ctx);
			stopSpinner();
			if (confirm) await ev.action.showOk();
		} catch (err) {
			stopSpinner();
			streamDeck.logger.error(`[${this.constructor.name}]`, err);
			await ev.action.showAlert();
		} finally {
			await this.restoreIdle(ev);
		}
	}

	private async restoreIdle(ev: WillAppearEvent<S> | KeyDownEvent<S>): Promise<void> {
		const image = this.idleImage(await ev.action.getSettings());
		await ev.action.setImage(image ? svgDataUri(image) : undefined);
		await ev.action.setTitle(image ? "" : this.label);
	}

	private startSpinner(ev: KeyDownEvent<S>): () => void {
		const start = Date.now();
		const stepMs = SPIN_PERIOD_MS / SPIN_STEPS;
		let last = -1;
		const id = setInterval(() => {
			const step = Math.floor(((Date.now() - start) % SPIN_PERIOD_MS) / stepMs);
			if (step === last) return; // only redraw when the comet actually moves
			last = step;
			void ev.action.setImage(svgDataUri(spinnerFrame(step)));
		}, 30);
		return () => clearInterval(id);
	}
}
