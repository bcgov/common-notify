import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ClientTenantMappingModule } from '../admin/client-tenant-mappings/client-tenant-mapping.module'
import { ChesModule } from '../../ches/ches.module'
import { TemplatesModule } from '../templates/templates.module'
import {
  NotifyController,
  NotifySimpleController,
  NotifyEventController,
  ChesEmailController,
} from './notify.controller'
import { NotifyService } from './notify.service'
import { NotificationModule } from '../notification/notification.module'
import { RenderingModule } from '../../services/rendering/rendering.module'
import { QueueModule } from '../../queue/queue.module'
import { AttachmentProcessingService } from './services/attachment-processing.service'
import { AttachmentValidationService } from './services/attachment-validation.service'
import { LocalAttachmentStorageService } from './services/local-attachment-storage.service'
import { MimeTypeCode } from '../notification/entities/mime-type-code.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([MimeTypeCode, NotifyConfiguration]),
    TenantsModule,
    ClientTenantMappingModule,
    ChesModule,
    NotificationModule,
    RenderingModule,
    forwardRef(() => TemplatesModule),
    forwardRef(() => QueueModule),
  ],
  controllers: [
    NotifySimpleController,
    NotifyEventController,
    NotifyController,
    ChesEmailController,
  ],
  providers: [
    NotifyService,
    AttachmentValidationService,
    AttachmentProcessingService,
    LocalAttachmentStorageService,
  ],
  exports: [
    NotifyService,
    RenderingModule,
    AttachmentValidationService,
    AttachmentProcessingService,
  ],
})
export class NotifyModule {}
