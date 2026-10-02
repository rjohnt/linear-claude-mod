export type Ticket = {
  id: string
  title: string
  status: string
  statusType: string
  priority: number
  url: string
  project: string | null
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

// What the pane shows: the list, or one ticket (selected) once its detail has loaded.
export type View = {
  selected: Ticket | null
  detail: TicketDetail | null
  isLoading: boolean
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'linear-claude-mod': { board: Board; view: View }
  }
}
