import { expect, mock, test } from 'claude-code/testing'

const row = {
  id: 'ENG-3',
  title: 'Ready to go',
  status: 'To Do',
  statusType: 'unstarted',
  priority: { value: 3 },
  url: 'https://linear.app/acme/issue/ENG-3',
  project: null,
  teamId: 'team-eng',
}

// The real list_issue_statuses answers a bare array, unsorted.
const STATES = [
  { id: 's-done', name: 'Done', type: 'completed' },
  { id: 's-todo', name: 'To Do', type: 'unstarted' },
  { id: 's-prog', name: 'In Progress', type: 'started' },
  { id: 's-back', name: 'Backlog', type: 'backlog' },
]

const PANE = {
  title: 'My Linear tickets',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const text = (body: unknown) => ({ value: { content: [{ type: 'text' as const, text: JSON.stringify(body) }], isError: false } })

test('c posts a comment, m moves the status, p sets priority, x cancels', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const current = { ...row }
  const comments: unknown[] = []
  on('mcp.call', async (_$, e) => {
    calls.push({ tool: e.tool, args: e.args as Record<string, unknown> })
    if (e.tool === 'get_issue') return text({ ...current, description: '', team: 'Engineering' })
    if (e.tool === 'list_comments') return text({ comments })
    if (e.tool === 'list_issue_statuses') return text(STATES)
    if (e.tool === 'save_comment') {
      comments.push({ author: { name: 'Me' }, body: e.args.body, createdAt: '1970-01-01T00:16:40.000Z' })
      return text({ id: 'c1' })
    }
    if (e.tool === 'save_issue') {
      if (e.args.state) Object.assign(current, { status: 'In Progress', statusType: 'started' })
      if (e.args.priority !== undefined) current.priority = { value: Number(e.args.priority) }
      return text(current)
    }
    return text({ issues: e.args.state === current.statusType ? [current] : [] })
  })
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))

  await $.command.run({ command: 'tickets', args: '' } as Parameters<typeof $.command.run>[0])
  const ui = await $.ui.mount({ plugin: 'linear-claude-mod', surface: 'terminal', component: 'Pane', requestId: 'linear-tickets', props: PANE })
  await ui.press({ key: 'ENG-3' })

  // Comment
  expect(await ui.find({ key: 'comment-input' })).toBeUndefined()
  await ui.press({ key: 'act:comment' })
  expect(await ui.find({ key: 'comment-input' })).toBeDefined()
  await ui.press({ key: 'act:cancel' })
  expect(await ui.find({ key: 'comment-input' })).toBeUndefined()
  await ui.press({ key: 'act:comment' })
  await ui.input({ key: 'comment-input', text: '  Looks good to me  ' })
  expect(calls.find(c => c.tool === 'save_comment')?.args).toEqual({ issueId: 'ENG-3', body: 'Looks good to me' })
  expect(await ui.find({ key: 'comment-input' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Comments \(1\)/ })).toBeDefined()

  // Move: statuses come from the ticket's team, in workflow order
  await ui.press({ key: 'act:move' })
  expect(calls.find(c => c.tool === 'list_issue_statuses')?.args).toEqual({ team: 'team-eng' })
  const select = await ui.find({ key: 'status-select' })
  expect((select?.props.options as { label: string }[]).map(o => o.label)).toEqual(['Backlog', 'To Do', 'In Progress', 'Done'])
  expect(select?.props.value).toBe('s-todo')
  await ui.select({ key: 'status-select', value: 's-prog' })
  expect(calls.find(c => c.tool === 'save_issue')?.args).toEqual({ id: 'ENG-3', state: 's-prog' })
  expect(await ui.find({ type: 'Text', text: /^In Progress/ })).toBeDefined()

  // Picking the current status writes nothing
  const writes = calls.filter(c => c.tool === 'save_issue').length
  await ui.press({ key: 'act:move' })
  await ui.select({ key: 'status-select', value: 's-prog' })
  expect(calls.filter(c => c.tool === 'save_issue').length).toBe(writes)
  expect(await ui.find({ key: 'status-select' })).toBeUndefined()

  // Priority
  await ui.press({ key: 'act:priority' })
  await ui.select({ key: 'priority-select', value: '1' })
  expect(calls.filter(c => c.tool === 'save_issue').at(-1)?.args).toEqual({ id: 'ENG-3', priority: 1 })
  expect(await ui.find({ type: 'Text', text: /Urgent|URG/ })).toBeDefined()
  await ui.unmount()
})
