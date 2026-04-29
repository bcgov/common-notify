/**
 * Code table interfaces for notification system
 * Used for managing reference data like statuses, channels, and event types
 */

export interface CodeTable {
  id: string
  label: string
  description?: string
}

export interface CodeTablesState {
  statuses: CodeTable[]
  channels: CodeTable[]
  eventTypes: CodeTable[]
  isLoading: boolean
  error: string | null
}
