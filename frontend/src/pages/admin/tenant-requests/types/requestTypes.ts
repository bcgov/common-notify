import type { FC } from 'react'
import type { TenantRequest } from '@/api/tenantRequests.api'
import ApproveSmsNumberRequestDialog from './ApproveSmsNumberRequestDialog'
import type { ApproveDialogProps } from './approveDialogProps'

/** What differs between types of request on the admin page. */
export interface RequestTypeUi {
  /**
   * The dialog for approving one, when approval needs a choice (e.g. which number). Without one,
   * approving is a plain confirmation.
   */
  ApproveDialog?: FC<ApproveDialogProps>
  /** What releasing an approved request does, for the confirmation. */
  releaseMessage: (request: TenantRequest) => string
}

/** Each request type's admin UI, by request type code. Add a type here when its backend handler lands. */
export const REQUEST_TYPES: Partial<Record<string, RequestTypeUi>> = {
  sms_number: {
    ApproveDialog: ApproveSmsNumberRequestDialog,
    releaseMessage: (request) =>
      `${request.tenantName} will send from the shared default number. The number stays in the inventory, free to assign again.`,
  },
}

/** For a type with no UI of its own: what releasing does, said generally. */
export const genericReleaseMessage = (request: TenantRequest): string =>
  `${request.tenantName} loses what this request granted. It can ask again.`
