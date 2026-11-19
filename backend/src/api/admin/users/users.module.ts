import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotifyUser } from './entities/notify-user.entity'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { AuthenticatedUserGuard } from '../../../common/guards/authenticated-user.guard'

@Module({
  imports: [TypeOrmModule.forFeature([NotifyUser])],
  providers: [UsersService, AuthenticatedUserGuard],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
