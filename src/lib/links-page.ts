import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type PageLink = { url: string; label: string; text: string };

function escapeHtml(text: string): string {
	return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Writes a small HTML page listing {@link links} to the temp dir and returns its file:// URL. */
export async function writeLinksPage(name: string, title: string, summary: string, links: PageLink[]): Promise<string> {
	const path = join(tmpdir(), `${name}.html`);
	const items = links
		.map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a> ${escapeHtml(link.text)}</li>`)
		.join("\n");
	await writeFile(
		path,
		`<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>:root{color-scheme:light dark}body{font:16px/1.6 -apple-system,sans-serif;max-width:720px;margin:48px auto;padding:0 24px}</style>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p><ul>
${items}
</ul>`,
	);
	return pathToFileURL(path).href;
}
