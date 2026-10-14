import { OpenRouter } from "@openrouter/sdk";
import type { ChatRequestReasoning, ProviderPreferences } from "@openrouter/sdk/models";

import { requireSecret } from "./secret";

let client: OpenRouter | undefined;

/**
 * One-shot, non-streaming OpenRouter chat completion returning the reply text.
 * The SDK client is created once and reused so connections stay warm.
 */
export async function openrouterChat(opts: {
	model: string;
	system: string;
	user: string;
	reasoning?: ChatRequestReasoning;
	provider?: ProviderPreferences;
}): Promise<string> {
	client ??= new OpenRouter({ apiKey: requireSecret("OPENROUTER_API_KEY") });

	const result = await client.chat.send({
		chatRequest: {
			model: opts.model,
			messages: [
				{ role: "system", content: opts.system },
				{ role: "user", content: opts.user },
			],
			reasoning: opts.reasoning,
			provider: opts.provider,
			stream: false,
		},
	});

	const content = "choices" in result ? result.choices[0]?.message?.content : undefined;
	if (typeof content !== "string") throw new Error("OpenRouter returned no text content.");
	return content;
}
