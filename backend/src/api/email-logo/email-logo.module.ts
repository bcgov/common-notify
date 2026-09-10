import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClamavModule } from '../../services/clamav.module'
import { AttachmentModule } from '../attachment/attachment.module'
import { EmailLogo } from '../tenant-settings/entities/email-logo.entity'
import { EmailLogoBootstrapService } from './email-logo-bootstrap.service'
import { EMAIL_LOGO_STORAGE } from './email-logo.constants'
import { EmailLogoController } from './email-logo.controller'
import { EmailLogoRepository } from './email-logo.repository'
import { EmailLogoService } from './email-logo.service'
import { EmailLogoStorageService } from './email-logo-storage.service'

@Module({
  imports: [TypeOrmModule.forFeature([EmailLogo]), AttachmentModule, ClamavModule],
  controllers: [EmailLogoController],
  providers: [
    EmailLogoRepository,
    EmailLogoStorageService,
    {
      provide: EMAIL_LOGO_STORAGE,
      useExisting: EmailLogoStorageService,
    },
    EmailLogoService,
    EmailLogoBootstrapService,
  ],
  exports: [EmailLogoRepository, EmailLogoStorageService, EmailLogoService, EMAIL_LOGO_STORAGE],
})
export class EmailLogoModule {}
