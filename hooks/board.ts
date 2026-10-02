import type { Ticket, TicketComment, TicketDetail } from '../types'

// The open state types, fetched one call each so finished tickets never eat the page limit.
export const OPEN_STATE_TYPES = ['started', 'unstarted', 'triage', 'backlog'] as const

export type Group = { status: string; tickets: Ticket[] }

// Lower is more actionable: what you're on, then what's ready to pick up, then
// what's waiting on someone else (review / QA), then the unsorted piles.
export function statusRank(t: Pick<Ticket, 'status' | 'statusType'>): number {
  if (t.statusType === 'started' && /in progress/i.test(t.status)) return 0
  if (t.statusType === 'unstarted') return 1
  if (t.statusType === 'started') return 2
  if (t.statusType === 'triage') return 3
  if (t.statusType === 'backlog') return 4
  return 5
}

// Linear priority: 1 Urgent .. 4 Low, 0 None sorts last.
const priorityRank = (p: number) => (p === 0 ? 5 : p)

export function groupTickets(tickets: readonly Ticket[]): Group[] {
  const sorted = [...tickets].sort(
    (a, b) =>
      statusRank(a) - statusRank(b) ||
      a.status.localeCompare(b.status) ||
      priorityRank(a.priority) - priorityRank(b.priority),
  )
  const groups: Group[] = []
  for (const t of sorted) {
    const last = groups[groups.length - 1]
    if (last?.status === t.status) last.tickets.push(t)
    else groups.push({ status: t.status, tickets: [t] })
  }
  return groups
}

type RawIssue = {
  id: string
  title: string
  status: string
  statusType: string
  priority?: { value: number } | null
  url: string
  project?: string | null
}

export function parseIssues(text: string): Ticket[] {
  const body = JSON.parse(text) as { issues?: RawIssue[] }
  return (body.issues ?? []).map(i => ({
    id: i.id,
    title: i.title,
    status: i.status,
    statusType: i.statusType,
    priority: i.priority?.value ?? 0,
    url: i.url,
    project: i.project ?? null,
  }))
}

export const PRIORITY_LABEL: Record<number, string> = {
  1: 'URG',
  2: 'HI ',
  3: 'MED',
  4: 'LOW',
  0: '   ',
}

export function workPrompt(t: Ticket): string {
  return [
    `Let's work on Linear ticket ${t.id}: "${t.title}" (${t.status}${t.project ? `, ${t.project}` : ''}).`,
    t.url,
    '',
    'Load it with the Linear tools: the full description, comments, sub-issues and any linked PRs or attachments. ' +
      'Summarize what is being asked and what is still open, find the relevant code, then propose a plan before changing anything.',
  ].join('\n')
}

export function ago(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

const nameOf = (v: unknown): string | null =>
  typeof v === 'string' ? v : v && typeof v === 'object' && 'name' in v ? String((v as { name: unknown }).name) : null

// get_issue and list_comments bodies; the list row supplies what get_issue spells differently.
export function parseDetail(ticket: Ticket, issueText: string, commentsText: string): TicketDetail {
  const issue = JSON.parse(issueText) as Record<string, unknown>
  const raw = (JSON.parse(commentsText) as { comments?: Record<string, unknown>[] }).comments ?? []
  const comments: TicketComment[] = raw
    .map(c => ({
      author: nameOf(c.author) ?? nameOf(c.user) ?? 'Someone',
      body: String(c.body ?? ''),
      createdAt: String(c.createdAt ?? ''),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const labels = Array.isArray(issue.labels) ? issue.labels.map(nameOf).filter((l): l is string => !!l) : []

  return {
    ...ticket,
    title: typeof issue.title === 'string' ? issue.title : ticket.title,
    status: typeof issue.status === 'string' ? issue.status : ticket.status,
    description: typeof issue.description === 'string' ? issue.description : '',
    assignee: nameOf(issue.assignee),
    labels,
    branch: typeof issue.gitBranchName === 'string' ? issue.gitBranchName : null,
    updatedAt: typeof issue.updatedAt === 'string' ? issue.updatedAt : null,
    comments,
  }
}
