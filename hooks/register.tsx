import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register, RenderNode } from 'claude-code'

import type { Board, Ticket, View } from '../types'
import { OPEN_STATE_TYPES, PRIORITY_LABEL, ago, groupTickets, parseDetail, parseIssues, workPrompt } from './board'

const PANE = 'linear-tickets'
const REFRESH_MS = 5 * 60 * 1000

// The Linear MCP server's name; set from the plugin's options when the module registers.
let LINEAR = 'plugin:linear:linear'

const board = atom({ plugin: 'linear-claude-mod', key: 'board' } as const, {
  tickets: [],
  loadedAt: null,
  isLoading: false,
  error: null,
} as Board)

const view = atom({ plugin: 'linear-claude-mod', key: 'view' } as const, {
  selected: null,
  detail: null,
  isLoading: false,
  error: null,
} as View)

function textOf(result: McpToolResult): string {
  const text = result.content.map(c => (c.type === 'text' ? c.text : '')).join('')
  if (result.isError) throw new Error(text.slice(0, 200) || 'Linear call failed')
  return text
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function refresh($: EngineInterface): Promise<void> {
  await update($, board, b => ({ ...b, isLoading: true }))
  try {
    const pages = await Promise.all(
      OPEN_STATE_TYPES.map(state =>
        $.mcp.call(LINEAR, 'list_issues', {
          assignee: 'me',
          state,
          limit: 100,
          fields: ['id', 'title', 'status', 'statusType', 'priority', 'url', 'project'],
        }),
      ),
    )
    const tickets = pages.flatMap(page => parseIssues(textOf(page)))
    const loadedAt = await $.clock.now()
    await update($, board, () => ({ tickets, loadedAt, isLoading: false, error: null }))
  } catch (err) {
    await update($, board, b => ({ ...b, isLoading: false, error: messageOf(err) }))
  }
}

async function showTicket($: EngineInterface, ticket: Ticket): Promise<void> {
  await update($, view, () => ({ selected: ticket, detail: null, isLoading: true, error: null }))
  try {
    const [issue, comments] = await Promise.all([
      $.mcp.call(LINEAR, 'get_issue', { id: ticket.id }),
      $.mcp.call(LINEAR, 'list_comments', { issueId: ticket.id, orderBy: 'createdAt', limit: 50 }),
    ])
    const detail = parseDetail(ticket, textOf(issue), textOf(comments))
    // A Back press (or another ticket) while this loaded wins.
    await update($, view, v => (v.selected?.id === ticket.id ? { ...v, detail, isLoading: false } : v))
  } catch (err) {
    await update($, view, v => (v.selected?.id === ticket.id ? { ...v, isLoading: false, error: messageOf(err) } : v))
  }
}

const backToList = ($: EngineInterface) =>
  update($, view, () => ({ selected: null, detail: null, isLoading: false, error: null }))

export const register: Register = (on, options) => {
  if (typeof options.linearServer === 'string' && options.linearServer) LINEAR = options.linearServer

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tickets',
      description: 'Show my assigned Linear tickets by status (click one to work on it)',
    })
    $.clock.every(REFRESH_MS, async () => {
      if ((await $.ui.panes()).some(p => p.id === PANE)) await refresh($)
    })

    return next(e)
  })

  on('command.run', { command: 'tickets' }, async $ => {
    await backToList($)
    const opened = await $.ui.open({ id: PANE, title: 'My Linear tickets', focus: true })
    await refresh($)
    const { tickets, error } = await read($, board)
    const count = error ? `Linear: ${error}` : `${tickets.length} open Linear tickets.`

    return { text: opened.isPlaced ? count : `${count} Pane not shown: ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link, Markdown } = $.ui.resolve(e)
    const now = await $.clock.now()
    const { selected, detail, isLoading: isDetailLoading, error: detailError } = await read($, view)

    if (selected) {
      const t = detail ?? selected
      const meta = [
        t.status,
        PRIORITY_LABEL[t.priority]?.trim() || null,
        t.project,
        detail?.assignee,
        detail?.updatedAt ? `updated ${ago(now - Date.parse(detail.updatedAt))}` : null,
      ].filter(Boolean)

      return (
        <Box flexDirection="column" gap={1}>
          <Box justifyContent="space-between">
            <Button key="back" plain hotkey="b" label="Back to list" onPress={() => void backToList($)} />
            <Link key="open" href={t.url} label="Open in Linear" />
          </Box>
          <Box flexDirection="column">
            <Text bold>
              {t.id}  {t.title}
            </Text>
            <Text dimColor>{meta.join(' · ')}</Text>
            {detail && detail.labels.length > 0 && <Text color="magenta">{detail.labels.join(', ')}</Text>}
            {detail?.branch && <Text dimColor>branch {detail.branch}</Text>}
          </Box>
          {isDetailLoading && <Text dimColor>Loading ticket…</Text>}
          {detailError && <Text color="red">Linear: {detailError}</Text>}
          {detail && (
            <Markdown key="description" text={detail.description.trim() || '_No description._'} />
          )}
          {detail && (
            <Box flexDirection="column">
              <Text bold>Comments ({detail.comments.length})</Text>
              {detail.comments.length === 0 && <Text dimColor>None yet.</Text>}
              {detail.comments.map((c, i) => (
                <Box key={`c:${i}`} flexDirection="column" marginTop={1}>
                  <Text color="cyan">
                    {c.author}
                    <Text dimColor>{c.createdAt ? `  ${ago(now - Date.parse(c.createdAt))}` : ''}</Text>
                  </Text>
                  <Markdown key={`cm:${i}`} text={c.body} />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    const { tickets, loadedAt, isLoading, error } = await read($, board)
    const cols = e.props.bodyColumns || e.viewport?.columns || 80
    const room = Math.max(3, (e.viewport?.rows ?? 24) - 3)
    const groups = groupTickets(tickets)

    const rows: RenderNode[] = []
    let hotkey = 1
    for (const g of groups) {
      if (rows.length >= room) break
      rows.push(
        <Text key={`h:${g.status}`} bold color={g.tickets[0]?.statusType === 'started' ? 'cyan' : undefined}>
          {g.status} ({g.tickets.length})
        </Text>,
      )
      for (const t of g.tickets) {
        if (rows.length >= room) break
        const key = hotkey <= 9 ? String(hotkey++) : undefined
        const label = `${PRIORITY_LABEL[t.priority] ?? '   '} ${t.id}  ${t.title}`
        rows.push(
          <Button
            key={t.id}
            plain
            hotkey={key}
            dimColor={t.statusType === 'backlog'}
            label={label.length > cols - 6 ? `${label.slice(0, cols - 7)}…` : label}
            onPress={() => {
              void $.prompt.submit({ text: workPrompt(t), asUser: true })
              void showTicket($, t)
            }}
          />,
        )
      }
    }
    const hidden = tickets.length + groups.length - rows.length

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text dimColor>
            {isLoading ? 'Refreshing…' : loadedAt ? `${tickets.length} open · ${ago(now - loadedAt)}` : ''}
          </Text>
          <Button key="refresh" plain hotkey="r" label="Refresh" onPress={() => void refresh($)} />
        </Box>
        {error && <Text color="red">Linear: {error}</Text>}
        {!isLoading && !error && loadedAt && tickets.length === 0 && <Text dimColor>No open tickets assigned to you.</Text>}
        {rows}
        {hidden > 0 && <Text dimColor>+{hidden} more</Text>}
      </Box>
    )
  })
}
