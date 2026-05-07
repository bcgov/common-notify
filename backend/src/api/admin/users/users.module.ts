import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotifyUser } from './entities/notify-user.entity'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'

@Module({
  imports: [TypeOrmModule.forFeature([NotifyUser])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
