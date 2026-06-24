import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import { S3Client } from '@aws-sdk/client-s3'
import { AttachmentEntity } from './entities/attachment.entity'
import { AttachmentRepository } from './attachment.repository'
import { ATTACHMENT_S3_CLIENT, ATTACHMENT_STORAGE } from './attachment.constants'
import { S3AttachmentStorageService } from './s3-attachment-storage.service'
import { AttachmentService } from './attachment.service'

@Module({
  imports: [TypeOrmModule.forFeature([AttachmentEntity])],
  providers: [
    AttachmentRepository,
    {
      provide: ATTACHMENT_S3_CLIENT,
      useFactory: (configService: ConfigService) =>
        new S3Client({
          endpoint: configService.get<string>('s3.endpoint'),
          region: configService.get<string>('s3.region'),
          forcePathStyle: configService.get<boolean>('s3.forcePathStyle') ?? true,
          credentials: {
            accessKeyId: configService.get<string>('s3.accessKey') || '',
            secretAccessKey: configService.get<string>('s3.secretKey') || '',
          },
        }),
      inject: [ConfigService],
    },
    S3AttachmentStorageService,
    {
      provide: ATTACHMENT_STORAGE,
      useExisting: S3AttachmentStorageService,
    },
    AttachmentService,
  ],
  exports: [
    AttachmentRepository,
    S3AttachmentStorageService,
    AttachmentService,
    ATTACHMENT_STORAGE,
  ],
})
export class AttachmentModule {}
