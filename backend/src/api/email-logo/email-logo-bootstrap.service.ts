import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { readFile } from 'fs/promises'
import * as path from 'path'
import { ClamavService } from '../../services/clamav.service'
import { EMAIL_LOGO_STORAGE, SYSTEM_EMAIL_LOGO_KEYS } from './email-logo.constants'
import { EmailLogoStorage } from './email-logo-storage.interface'

@Injectable()
export class EmailLogoBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(EmailLogoBootstrapService.name)

  constructor(
    private readonly configService: ConfigService,
    @Inject(EMAIL_LOGO_STORAGE) private readonly storage: EmailLogoStorage,
    private readonly clamavService: ClamavService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.configService.get<string>('s3.bucket')) {
      this.logger.warn('Email logo seed upload skipped because S3_BUCKET is not set')
      return
    }

    const assetDirectory = this.configService.get<string>('emailLogo.seedAssetDirectory')

    for (const storageKey of SYSTEM_EMAIL_LOGO_KEYS) {
      if (await this.storage.head(storageKey)) {
        this.logger.log(`Email logo seed object already exists; skipping "${storageKey}"`)
        continue
      }

      const filename = path.posix.basename(storageKey)
      const content = await readFile(path.join(assetDirectory, filename))
      const scanResult = await this.clamavService.scanBuffer(content, filename)
      if (scanResult.isInfected) {
        const viruses = scanResult.viruses.join(', ') || 'unknown malware'
        throw new Error(`Email logo seed file "${filename}" failed virus scan: ${viruses}`)
      }

      await this.storage.upload({
        storageKey,
        content,
        mimeType: 'image/png',
      })
      this.logger.log(`Uploaded email logo seed object "${storageKey}"`)
    }
  }
}
