# linear-claude-mod

A [Claude Code mod](https://claude.dev/blog/getting-started-with-claude-code-mods/) that puts your assigned
Linear tickets in a pane. Click one to start working on it.

- Tickets are grouped by status, most actionable first: In Progress, To Do, review/QA, Triage, Backlog.
  Within a status they sort by priority. Done and canceled tickets are hidden.
- Clicking a ticket asks Claude to load it and propose a plan. The pane then shows the ticket's details
  and comments, with a Back button to return to the list.
- Keys (pane focused): `1`–`9` open a ticket, `b` goes back, `r` refreshes. The list also refreshes
  every 5 minutes.

Works in the terminal and the desktop app.

## Setup

You need a connected Linear MCP server, such as the official Linear plugin. The mod uses its
login, so there's no API key to set.

Load the mod in every session by adding it to `~/.claude/settings.json`, then restart Claude Code:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/linear-claude-mod" } }
```

Or for one session: `claude --plugin-dir /path/to/linear-claude-mod`.

Then type `/tickets`.

If your Linear MCP server isn't named `plugin:linear:linear` (check `/mcp`), set the `linearServer`
option in `/config`.

## Develop

```sh
claude plugin validate .
claude plugin test .
```

The code is in `hooks/`: `register.tsx` has the command and the pane, and `board.ts` has the sorting and
parsing helpers.

## License

MIT
