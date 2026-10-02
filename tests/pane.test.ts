import { expect, mock, test } from 'claude-code/testing'

const issue = (id: string, title: string, status: string, statusType: string, priority: number) => ({
  id,
  title,
  status,
  statusType,
  priority: { value: priority },
  url: `https://linear.app/acme/issue/${id}`,
  project: null,
})

const ISSUES: Record<string, unknown[]> = {
  started: [issue('ENG-2', 'Review me', 'In Review', 'started', 2), issue('ENG-1', 'Doing it', 'In Progress', 'started', 3)],
  unstarted: [issue('ENG-3', 'Ready to go', 'To Do', 'unstarted', 1)],
  triage: [],
  backlog: [issue('ENG-4', 'Someday', 'Backlog', 'backlog', 0)],
}

const DETAIL = {
  ...issue('ENG-3', 'Ready to go', 'To Do', 'unstarted', 1),
  description: 'Make the **thing** work.',
  assignee: 'Pat Example',
  labels: [{ name: 'Bug' }],
  gitBranchName: 'pat/eng-3-ready-to-go',
  updatedAt: '1970-01-01T00:00:00.000Z',
}

const COMMENTS = [{ author: { name: 'Sam Example' }, body: 'Repro steps attached.', createdAt: '1970-01-01T00:00:00.000Z' }]

const PANE = {
  title: 'My Linear tickets',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const text = (body: unknown) => ({ value: { content: [{ type: 'text' as const, text: JSON.stringify(body) }], isError: false } })

test('lists tickets by actionable status; a click shows the ticket; w loads it; Back returns', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('mcp.call', async (_$, e) => {
    if (e.tool === 'get_issue') return text(DETAIL)
    if (e.tool === 'list_comments') return text({ comments: COMMENTS })
    return text({ issues: ISSUES[String(e.args.state)] ?? [] })
  })
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  const submitted: string[] = []
  on('prompt.submit', async (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.command.run({ command: 'tickets', args: '' } as Parameters<typeof $.command.run>[0])
    const ui = await $.ui.mount({ plugin: 'linear-claude-mod', surface, component: 'Pane', requestId: 'linear-tickets', props: PANE })

    const headers = (await ui.findAll({ type: 'Text', text: /\(\d+\)$/ })).map(n => n.text)
    expect(headers).toEqual(['In Progress (1)', 'To Do (1)', 'In Review (1)', 'Backlog (1)'])

    await ui.press({ key: 'ENG-3' })
    expect(submitted.length).toBe(0)
    expect(await ui.find({ key: 'back' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Ready to go/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Bug/ })).toBeDefined()
    expect(await ui.find({ key: 'description' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sam Example/ })).toBeDefined()

    await ui.press({ key: 'work' })
    expect(submitted.length).toBe(1)
    expect(submitted[0]).toContain('ENG-3')
    expect(submitted[0]).toContain('https://linear.app/acme/issue/ENG-3')
    submitted.length = 0

    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'back' })).toBeUndefined()
    expect(await ui.find({ key: 'ENG-3' })).toBeDefined()
    await ui.unmount()
  }
})
