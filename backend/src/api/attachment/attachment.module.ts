import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AttachmentEntity } from './entities/attachment.entity'
import { AttachmentRepository } from './attachment.repository'

@Module({
  imports: [TypeOrmModule.forFeature([AttachmentEntity])],
  providers: [AttachmentRepository],
  exports: [AttachmentRepository],
})
export class AttachmentModule {}
