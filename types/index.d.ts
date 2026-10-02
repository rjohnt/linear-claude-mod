export type Ticket = {
  id: string
  title: string
  status: string
  statusType: string
  priority: number
  url: string
  project: string | null
  // The team's id when Linear gave one, else its name; what list_issue_statuses takes.
  team: string | null
}

export type Board = {
  tickets: Ticket[]
  loadedAt: number | null
  isLoading: boolean
  error: string | null
}

export type TicketComment = { author: string; body: string; createdAt: string }

export type TicketDetail = Ticket & {
  description: string
  assignee: string | null
  labels: string[]
  branch: string | null
  updatedAt: string | null
  comments: TicketComment[]
}

export type WorkflowState = { id: string | null; name: string; type: string }

// The open action on the shown ticket: writing a comment, or picking a status or priority.
export type Action = 'comment' | 'move' | 'priority'

// What the pane shows: the list, or one ticket (selected) once its detail has loaded.
export type View = {
  selected: Ticket | null
  detail: TicketDetail | null
  isLoading: boolean
  error: string | null
  action: Action | null
  // The team's workflow states, loaded when the status picker first opens.
  states: WorkflowState[] | null
  // A write in flight ("Posting comment…"), shown while it runs.
  saving: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'linear-claude-mod': { board: Board; view: View }
  }
}
