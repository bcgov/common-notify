import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { AuthJwtStrategy } from './auth.jwt-strategy'
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [AuthJwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
