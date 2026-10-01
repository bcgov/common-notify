import { describe, it, expect } from 'vitest'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { MonitoringController } from './monitoring.controller'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { ROLES_KEY } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'

describe('MonitoringController', () => {
  it('is guarded by NotifyAdminGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MonitoringController)).toContain(NotifyAdminGuard)
  })

  it('requires the NOTIFY_ADMIN SSO role for the queue endpoint', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, MonitoringController.prototype.getQueues)
    expect(roles).toEqual([SsoRole.NOTIFY_ADMIN])
  })
})
