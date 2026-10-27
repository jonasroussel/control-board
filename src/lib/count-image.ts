/** Key image (SVG) showing {@link count} as a large centred number in {@link color}. */
export function countImage(count: number, color: string): string {
	const size = count >= 100 ? 54 : count >= 10 ? 78 : 94;
	const y = 72 + size * 0.34; // baseline for vertical centring (renderer-agnostic)
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144"><text x="72" y="${y.toFixed(0)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${size}" fill="${color}">${count}</text></svg>`;
}
