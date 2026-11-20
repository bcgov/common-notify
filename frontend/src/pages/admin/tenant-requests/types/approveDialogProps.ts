import type { TenantRequest } from '@/api/tenantRequests.api'

/** What every type's approval dialog is given. It approves the request itself, then calls onSaved. */
export interface ApproveDialogProps {
  request: TenantRequest
  onClose: () => void
  onSaved: () => void
}
