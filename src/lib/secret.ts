import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Returns a secret from the environment, falling back to the `.env` file next to
 * the plugin manifest (one level up from the compiled `bin/`). GUI-launched
 * plugins don't inherit interactive shell exports, so the `.env` is the usual source.
 */
export function requireSecret(name: string): string {
	if (!process.env[name]) {
		const envPath = join(import.meta.dirname, "..", ".env");
		if (existsSync(envPath)) process.loadEnvFile(envPath);
	}

	const value = process.env[name];
	if (!value) throw new Error(`${name} missing; add it to the plugin's .env file.`);
	return value;
}
