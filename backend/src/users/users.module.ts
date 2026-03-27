import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { User } from './entities/user.entity'

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  imports: [TypeOrmModule.forFeature([User])],
})
export class UsersModule {}
