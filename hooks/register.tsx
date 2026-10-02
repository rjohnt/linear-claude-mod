import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register, RenderNode } from 'claude-code'

import type { Action, Board, Ticket, View, WorkflowState } from '../types'
import {
  OPEN_STATE_TYPES,
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  ago,
  groupTickets,
  parseDetail,
  parseIssues,
  parseStates,
  workPrompt,
} from './board'

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

const EMPTY_VIEW: View = { selected: null, detail: null, isLoading: false, error: null, action: null, states: null, saving: null }

const view = atom({ plugin: 'linear-claude-mod', key: 'view' } as const, EMPTY_VIEW)

// Each action's field, by the key the pane draws it under.
const ACTION_KEY: Record<Action, string> = { comment: 'comment-input', move: 'status-select', priority: 'priority-select' }

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
          fields: ['id', 'title', 'status', 'statusType', 'priority', 'url', 'project', 'teamId'],
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
  await update($, view, () => ({ ...EMPTY_VIEW, selected: ticket, isLoading: true }))
  await loadDetail($, ticket)
}

// Fetches the ticket's detail and comments into the view, keeping what is shown until they land.
async function loadDetail($: EngineInterface, ticket: Ticket): Promise<void> {
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

const backToList = ($: EngineInterface) => update($, view, () => EMPTY_VIEW)

// Runs fn on the shown ticket only if it is still the one shown.
const onShown = (id: string, fn: (v: View) => View) => (v: View) => (v.selected?.id === id ? fn(v) : v)

async function openAction($: EngineInterface, action: Action): Promise<void> {
  const { selected, detail, states } = await read($, view)
  if (!selected) return
  await update($, view, v => ({ ...v, action, error: null }))
  // Best effort: the keyboard is the person's, so this is refused when they hold it elsewhere.
  $.ui.focus({ requestId: PANE, key: ACTION_KEY[action] }).catch(() => {})
  if (action !== 'move' || states) return

  const team = detail?.team ?? selected.team
  try {
    if (!team) throw new Error('this ticket has no team to list statuses for')
    const loaded = parseStates(textOf(await $.mcp.call(LINEAR, 'list_issue_statuses', { team })))
    await update($, view, onShown(selected.id, v => ({ ...v, states: loaded })))
  } catch (err) {
    await update($, view, onShown(selected.id, v => ({ ...v, action: null, error: messageOf(err) })))
  }
}

const closeAction = ($: EngineInterface) => update($, view, v => ({ ...v, action: null }))

// One write to the shown ticket: marks it saving, runs it, then reloads the ticket and the list.
async function write(
  $: EngineInterface,
  saving: string,
  run: (t: Ticket) => Promise<unknown>,
  done: (t: Ticket) => { toast: string; patch?: Partial<Ticket> },
): Promise<void> {
  const { selected, saving: busy } = await read($, view)
  if (!selected || busy) return
  await update($, view, v => ({ ...v, saving, error: null }))
  try {
    await run(selected)
    const { toast, patch } = done(selected)
    const ticket = { ...selected, ...patch }
    await update($, view, onShown(selected.id, v => ({
      ...v,
      selected: ticket,
      detail: v.detail && { ...v.detail, ...patch },
      action: null,
      saving: null,
    })))
    void $.ui.toast(toast)
    await Promise.all([loadDetail($, ticket), refresh($)])
  } catch (err) {
    await update($, view, onShown(selected.id, v => ({ ...v, saving: null, error: messageOf(err) })))
  }
}

const postComment = ($: EngineInterface, body: string) =>
  body.trim()
    ? write(
        $,
        'Posting comment…',
        async t => textOf(await $.mcp.call(LINEAR, 'save_comment', { issueId: t.id, body: body.trim() })),
        t => ({ toast: `Commented on ${t.id}` }),
      )
    : closeAction($)

async function moveTo($: EngineInterface, value: string): Promise<void> {
  const { selected, detail, states } = await read($, view)
  const state = states?.find(s => (s.id ?? s.name) === value)
  if (!selected || !state || state.name === (detail ?? selected).status) return void (await closeAction($))
  await write(
    $,
    `Moving to ${state.name}…`,
    async t => textOf(await $.mcp.call(LINEAR, 'save_issue', { id: t.id, state: state.id ?? state.name })),
    t => ({ toast: `${t.id} → ${state.name}`, patch: { status: state.name, statusType: state.type } }),
  )
}

async function setPriority($: EngineInterface, value: string): Promise<void> {
  const { selected } = await read($, view)
  const priority = Number(value)
  if (!selected || priority === selected.priority) return void (await closeAction($))
  const name = PRIORITY_OPTIONS.find(o => o.value === value)?.label ?? value
  await write(
    $,
    `Setting priority to ${name}…`,
    async t => textOf(await $.mcp.call(LINEAR, 'save_issue', { id: t.id, priority })),
    t => ({ toast: `${t.id} priority → ${name}`, patch: { priority } }),
  )
}

const stateValue = (s: WorkflowState) => s.id ?? s.name

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
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Link, Markdown } = ui
    // Mobile draws no Input or Select yet, so it gets no actions.
    const fields = 'Input' in ui && 'Select' in ui ? { Input: ui.Input, Select: ui.Select } : null
    const now = await $.clock.now()
    const {
      selected,
      detail,
      isLoading: isDetailLoading,
      error: detailError,
      action,
      states,
      saving,
    } = await read($, view)

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
          {fields && (
            <Box flexDirection="column">
              <Box gap={2}>
                <Button key="act:comment" plain hotkey="c" label="Comment" onPress={() => void openAction($, 'comment')} />
                <Button key="act:move" plain hotkey="m" label="Move" onPress={() => void openAction($, 'move')} />
                <Button key="act:priority" plain hotkey="p" label="Priority" onPress={() => void openAction($, 'priority')} />
                {action && <Button key="act:cancel" plain hotkey="x" label="Cancel" onPress={() => void closeAction($)} />}
              </Box>
              {saving && <Text dimColor>{saving}</Text>}
              {!saving && action === 'comment' && (
                <fields.Input
                  key={ACTION_KEY.comment}
                  label="Comment: "
                  placeholder="Markdown; Enter posts it"
                  submitLabel="post"
                  autoFocus
                  onSubmit={value => void postComment($, value)}
                />
              )}
              {!saving && action === 'move' && !states && <Text dimColor>Loading statuses…</Text>}
              {!saving && action === 'move' && states && states.length > 0 && (
                <fields.Select
                  key={ACTION_KEY.move}
                  label="Move to: "
                  options={states.map(s => ({ value: stateValue(s), label: s.name }))}
                  value={stateValue(states.find(s => s.name === t.status) ?? states[0]!)}
                  autoFocus
                  onSelect={value => void moveTo($, value)}
                />
              )}
              {!saving && action === 'priority' && (
                <fields.Select
                  key={ACTION_KEY.priority}
                  label="Priority: "
                  options={PRIORITY_OPTIONS}
                  value={String(t.priority)}
                  autoFocus
                  onSelect={value => void setPriority($, value)}
                />
              )}
            </Box>
          )}
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
