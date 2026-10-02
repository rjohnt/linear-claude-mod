#!/usr/bin/env node
// A stand-in Linear MCP server for recording demos. It speaks MCP over stdio with no
// dependencies, serves fictional tickets in the same JSON shapes the real Linear MCP
// returns, and keeps writes (comments, status changes) in memory for the session.

import { createInterface } from 'node:readline'

const NOW = Date.now()
const hoursAgo = h => new Date(NOW - h * 3600_000).toISOString()

const ME = { id: 'user-me', name: 'Ryan Timmons', email: 'ryan@acme.dev' }
const PEOPLE = {
  priya: { id: 'user-priya', name: 'Priya Natarajan' },
  marco: { id: 'user-marco', name: 'Marco Bellini' },
  jun: { id: 'user-jun', name: 'Jun Okafor' },
  qa: { id: 'user-qa', name: 'Dana Whitfield' },
}

const TEAM = { id: 'team-eng', name: 'Engineering' }

const STATUSES = [
  { id: 'state-triage', name: 'Triage', type: 'triage' },
  { id: 'state-backlog', name: 'Backlog', type: 'backlog' },
  { id: 'state-todo', name: 'To Do', type: 'unstarted' },
  { id: 'state-in-progress', name: 'In Progress', type: 'started' },
  { id: 'state-in-review', name: 'In Review', type: 'started' },
  { id: 'state-qa-review', name: 'QA Review', type: 'started' },
  { id: 'state-done', name: 'Done', type: 'completed' },
  { id: 'state-canceled', name: 'Canceled', type: 'canceled' },
]
const PRIORITY_NAME = { 0: 'No priority', 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' }

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

let n = 0
const comments = {}
function ticket(id, title, status, priority, project, labels, updatedH, description, thread = []) {
  comments[id] = thread.map(([who, h, body]) => ({
    id: `comment-${++n}`,
    author: who === 'me' ? ME : PEOPLE[who],
    body,
    createdAt: hoursAgo(h),
  }))
  return {
    id,
    title,
    status,
    priority,
    project,
    labels,
    description,
    createdAt: hoursAgo(updatedH + 72),
    updatedAt: hoursAgo(updatedH),
    url: `https://linear.app/acme/issue/${id}/${slug(title)}`,
  }
}

const ISSUES = [
  ticket(
    'ENG-482',
    'Checkout fails when a saved card has expired',
    'In Progress',
    1,
    'Payments',
    ['Bug', 'Customer reported'],
    2,
    `Customers with an expired saved card get a blank error toast at checkout and can't complete the order.

## Repro
1. Save a card, then set its expiry to last month in the test vault
2. Add any item to the cart and go to checkout
3. Click **Place order**

## Expected
We prompt for a new card and keep the cart intact.

## Notes
- The \`402\` from the gateway is swallowed in \`PaymentForm.submit\`
- Roughly 40 support tickets this week`,
    [
      ['priya', 30, 'Support is seeing this a lot since the Monday release. Bumping to urgent.'],
      ['marco', 26, 'The gateway returns `card_expired` in the body, so we can branch on that instead of the status code.'],
      ['me', 3, 'Picking this up. I think the fix belongs in the payment form, not the gateway client.'],
    ],
  ),
  ticket(
    'ENG-477',
    'Add CSV export to the orders table',
    'In Progress',
    3,
    'Admin Dashboard',
    ['Feature'],
    20,
    `Ops wants to export the filtered orders table to CSV.

- Respect the current filters and sort
- Include order id, customer, total, status, created at
- Stream it so 50k rows doesn't time out`,
    [['jun', 40, 'Design is in Figma under *Orders / Export*. Just a button next to the filter bar.']],
  ),
  ticket(
    'ENG-490',
    'Rate-limit the public search endpoint',
    'To Do',
    2,
    'Platform',
    ['Security'],
    8,
    `\`GET /api/search\` has no rate limit and a scraper hit it 200k times yesterday.

Add a per-IP token bucket (60 req/min burst, 10/s sustained) and return \`429\` with \`Retry-After\`.`,
    [['marco', 9, 'We already have the limiter middleware in `platform/ratelimit`, it just needs wiring up here.']],
  ),
  ticket(
    'ENG-468',
    'Dark mode contrast on the settings page',
    'To Do',
    3,
    'Admin Dashboard',
    ['Design', 'Accessibility'],
    50,
    'Several labels on Settings fail WCAG AA in dark mode (secondary text is #6b6b6b on #1a1a1a). Use the `--text-muted` token instead of the hard-coded grays.',
  ),
  ticket(
    'ENG-455',
    'Flaky test: OrderSync retries on timeout',
    'To Do',
    4,
    'Platform',
    ['Tech debt'],
    96,
    'Fails about 1 in 15 CI runs. It sleeps for real time instead of using the fake clock.',
  ),
  ticket(
    'ENG-471',
    'Migrate session store from Redis to Postgres',
    'In Review',
    2,
    'Platform',
    ['Infra'],
    5,
    'Part of the Redis retirement. PR is up: sessions table, a dual-write window, and a backfill job.',
    [
      ['priya', 6, 'Left a few comments on the backfill batching. Otherwise looks good.'],
      ['me', 5, 'Addressed, batch size is configurable now.'],
    ],
  ),
  ticket(
    'ENG-463',
    'Order confirmation email shows UTC times',
    'QA Review',
    3,
    'Payments',
    ['Bug'],
    12,
    "The confirmation email renders the pickup window in UTC. It should use the store's time zone.",
    [['qa', 11, 'Verifying on staging with a Pacific-time store now.']],
  ),
  ticket(
    'ENG-494',
    'Webhook deliveries stuck in "pending"',
    'Triage',
    2,
    'Platform',
    ['Bug'],
    1,
    'A customer says webhooks for `order.updated` have been pending for 3 hours. Could be the retry worker.',
  ),
  ticket(
    'ENG-421',
    'Onboarding checklist for new merchants',
    'Backlog',
    0,
    'Growth',
    ['Feature'],
    300,
    'A dismissible checklist on the merchant home page: connect payouts, add a product, invite a teammate.',
  ),
  ticket(
    'ENG-402',
    'Replace moment.js with date-fns',
    'Backlog',
    4,
    'Platform',
    ['Tech debt'],
    500,
    'moment is 70 KB of our bundle. date-fns is tree-shakeable.',
  ),
]

const typeOf = name => STATUSES.find(s => s.name.toLowerCase() === String(name).toLowerCase())?.type
const find = id => ISSUES.find(i => i.id.toLowerCase() === String(id).toLowerCase() || i.url === id)

function listRow(i) {
  return {
    id: i.id,
    identifier: i.id,
    title: i.title,
    status: i.status,
    statusType: typeOf(i.status),
    priority: { value: i.priority, name: PRIORITY_NAME[i.priority] },
    url: i.url,
    project: i.project,
    labels: i.labels,
    assignee: ME.name,
    updatedAt: i.updatedAt,
    team: TEAM.name,
    teamId: TEAM.id,
  }
}

function fullIssue(i) {
  return {
    ...listRow(i),
    description: i.description,
    assignee: ME,
    labels: i.labels.map(name => ({ name })),
    gitBranchName: `ryan/${i.id.toLowerCase()}-${slug(i.title).slice(0, 40).replace(/-$/, '')}`,
    createdAt: i.createdAt,
    attachments: [],
    children: [],
  }
}

function mustFind(id) {
  const i = find(id)
  if (!i) throw new Error(`Issue ${id} not found`)
  return i
}

const TOOLS = {
  list_issues: {
    description: 'List Linear issues, filtered by assignee, state (name or type), project, or a text query.',
    inputSchema: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'User name, email, or "me"' },
        state: { type: 'string', description: 'State name or type (started, unstarted, triage, backlog, completed, canceled)' },
        project: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    run({ state, project, query, limit = 50 }) {
      const q = query && String(query).toLowerCase()
      const s = state && String(state).toLowerCase()
      const issues = ISSUES.filter(
        i =>
          (!s || typeOf(i.status) === s || i.status.toLowerCase() === s) &&
          (!project || i.project.toLowerCase() === String(project).toLowerCase()) &&
          (!q || `${i.id} ${i.title} ${i.description}`.toLowerCase().includes(q)),
      )
      return { issues: issues.slice(0, limit).map(listRow) }
    },
  },
  get_issue: {
    description: 'Get a Linear issue by id (e.g. ENG-123) with its description, labels and branch name.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: ({ id }) => fullIssue(mustFind(id)),
  },
  list_comments: {
    description: 'List the comments on a Linear issue.',
    inputSchema: { type: 'object', properties: { issueId: { type: 'string' }, limit: { type: 'number' } }, required: ['issueId'] },
    run: ({ issueId }) => ({ comments: comments[mustFind(issueId).id] }),
  },
  save_comment: {
    description: 'Add a comment to a Linear issue.',
    inputSchema: { type: 'object', properties: { issueId: { type: 'string' }, body: { type: 'string' } }, required: ['issueId', 'body'] },
    run({ issueId, body }) {
      const i = mustFind(issueId)
      const c = { id: `comment-${++n}`, author: ME, body: String(body), createdAt: new Date().toISOString() }
      comments[i.id].push(c)
      i.updatedAt = c.createdAt
      return c
    },
  },
  save_issue: {
    description: 'Update a Linear issue: its state (id or name), priority (0-4), or title.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, state: { type: 'string' }, priority: { type: 'number' }, title: { type: 'string' } },
      required: ['id'],
    },
    run({ id, state, priority, title }) {
      const i = mustFind(id)
      if (state !== undefined) {
        const want = String(state).toLowerCase()
        const s = STATUSES.find(s => s.id === state || s.name.toLowerCase() === want)
        if (!s) throw new Error(`Unknown state "${state}". Valid: ${STATUSES.map(s => s.name).join(', ')}`)
        i.status = s.name
      }
      if (priority !== undefined) i.priority = Number(priority)
      if (title !== undefined) i.title = String(title)
      i.updatedAt = new Date().toISOString()
      return fullIssue(i)
    },
  },
  list_issue_statuses: {
    description: 'List the workflow states for the team.',
    inputSchema: { type: 'object', properties: { team: { type: 'string' } }, required: ['team'] },
    // The real server answers a bare array.
    run: () => STATUSES,
  },
  get_user: {
    description: 'Get a Linear user; "me" is the signed-in user.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    run: () => ME,
  },
}

const send = msg => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`)

function handle({ method, params }) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'linear-demo', version: '1.0.0' },
        instructions: 'Linear workspace for the Acme engineering team. Ticket ids look like ENG-482.',
      }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) }
    case 'tools/call': {
      const tool = TOOLS[params?.name]
      if (!tool) return { content: [{ type: 'text', text: `Unknown tool ${params?.name}` }], isError: true }
      try {
        return { content: [{ type: 'text', text: JSON.stringify(tool.run(params.arguments ?? {}), null, 2) }] }
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true }
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 })
  }
}

createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return send({ id: null, error: { code: -32700, message: 'Parse error' } })
  }
  if (msg.id === undefined) return // a notification; nothing to answer
  try {
    send({ id: msg.id, result: handle(msg) })
  } catch (err) {
    send({ id: msg.id, error: { code: err.code ?? -32603, message: err.message } })
  }
})
