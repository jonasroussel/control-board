# Control Board

A personal [Stream Deck](https://www.elgato.com/stream-deck) plugin ("My Scripts", UUID `com.jonasroussel`) that runs my day-to-day scripts from a key press.

Built with the [Elgato Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started) (Node.js 24, TypeScript, Rollup).

## Actions

| Key | What it does | Needs |
| --- | --- | --- |
| **Sync PRs to Gather** | Lists my open, non-draft PRs in `l3mpire/lempire` still waiting for review from `vincent-boulin` (or team `scope-lemrich`), then mirrors them into a Gather Inbox object (clears the feed, adds one entry per PR, sets the counter). | `gh`, `GATHER_WEBHOOK_SECRET` |
| **Next Deploy PRs** | Reads the time of the last message in the Slack `#deploys` channel, finds my PRs merged after it, and DMs me the list on Slack. | `gh`, Claude Code with the Slack MCP connector |
| **PRs to Review** | Counts open PRs where I am a requested reviewer, or that are assigned to `vincent-boulin` with team `scope-lemrich` requested. Shows the number on the key (green / orange / red). Hold the key (600 ms) to reset it to the eye icon. | `gh` |
| **Fix Text** | Copies the selected text in any app, fixes spelling and grammar with an LLM (keeps my style), and pastes the result back. The clipboard is restored after. | `OPENROUTER_API_KEY`, Accessibility permission |
| **Gather: Active / Busy / Away** | Focuses GatherV2, sends the status shortcut (`⌘O` / `⌘I` / `⌘U`), then gives focus back to the previous app. | GatherV2 app, Accessibility permission |

While a script runs, the key shows a spinner. On success it shows a checkmark; on error it shows an alert triangle and writes the error to the plugin log.

## Requirements

- macOS (the scripts use `pbcopy`, `pbpaste`, `osascript`, and `open`)
- Stream Deck app 7.1 or newer
- Node.js and npm, to build
- [GitHub CLI](https://cli.github.com/) at `/opt/homebrew/bin/gh`, logged in (`gh auth login`)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) at `~/.local/bin/claude`, with the Slack connector enabled (only for **Next Deploy PRs**)
- Accessibility permission for the Stream Deck app (System Settings → Privacy & Security → Accessibility), so it can send key presses

## Setup

```sh
npm install
npm run build
npx streamdeck link com.jonasroussel.sdPlugin
```

Create `com.jonasroussel.sdPlugin/.env` (git-ignored) with the secrets:

```sh
GATHER_WEBHOOK_SECRET=...
OPENROUTER_API_KEY=...
```

The plugin is started by the Stream Deck app, so it does not see your shell variables. Secrets are read from the process environment first, then from this `.env` file.

## Development

```sh
npm run watch
```

Rebuilds on change and restarts the plugin in the Stream Deck app.

Logs are written to `com.jonasroussel.sdPlugin/logs/`.

## Project structure

```
src/
  plugin.ts          Entry point: registers all actions and connects to Stream Deck
  script-action.ts   ScriptAction base class: spinner, success/alert, long press, idle image
  actions/           One file per key
  lib/               Helpers: gh, claude, openrouter, macos (clipboard, keys, apps), secret, sh
com.jonasroussel.sdPlugin/
  manifest.json      Plugin and action declarations
  imgs/              Icons
  bin/               Build output (git-ignored)
```

## Adding a new key

1. Create `src/actions/my-action.ts` with a class that extends `ScriptAction`, decorated with `@action({ UUID: "com.jonasroussel.my-action" })`, and implement `run(ctx, ev)`. Throw to show the alert.
2. Register it in `src/plugin.ts` with `streamDeck.actions.registerAction(new MyAction())`.
3. Declare it in `com.jonasroussel.sdPlugin/manifest.json` with the same UUID, and add its icons under `imgs/actions/`.
