# linear-claude-mod

A [Claude Code mod](https://claude.dev/blog/getting-started-with-claude-code-mods/) that puts your assigned
Linear tickets in a pane. Click one to start working on it.

- Tickets are grouped by status, most actionable first: In Progress, To Do, review/QA, Triage, Backlog.
  Within a status they sort by priority. Done and canceled tickets are hidden.
- Clicking a ticket asks Claude to load it and propose a plan. The pane then shows the ticket's details
  and comments, with a Back button to return to the list.
- Keys (pane focused): `1`–`9` open a ticket, `b` goes back, `r` refreshes. The list also refreshes
  every 5 minutes.
- On a ticket: `c` writes a comment (Enter posts it), `m` opens a status picker with the team's
  workflow states, `p` opens a priority picker, and `x` cancels. The ticket and the list reload after
  each change. These need a surface with text fields, so the mobile app shows the ticket read-only.

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

## Demo mode

To record a demo without showing your real workspace, run:

```sh
./demo/demo.sh
```

This starts Claude Code with a mock Linear MCP server (`demo/mock-linear.mjs`) and no other MCP
servers. The mock serves ten fictional "Acme" tickets in the same shapes the real Linear MCP returns, so
both the pane and Claude read the same fake data. Comments and status changes Claude makes are kept in
memory and reset when the session ends. To change the tickets, edit `ISSUES` in the mock.

## License

MIT
