import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { APP_GUARD } from '@nestjs/core'
import { AuthJwtGuard } from './auth.jwt-guard'
import { AuthJwtStrategy } from './auth.jwt-strategy'
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [
    AuthJwtStrategy,
    {
      provide: APP_GUARD,
      useClass: AuthJwtGuard,
    },
  ],
  exports: [PassportModule],
})
export class AuthModule {}
