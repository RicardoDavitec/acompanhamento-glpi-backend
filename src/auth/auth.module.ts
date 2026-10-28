import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule } from '../config/config.module';
import { SessionService } from './session.service';
import { SessionAuthGuard } from './session-auth.guard';
import { AdminGuard } from './admin.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { LdapService } from './ldap.service';

@Module({
  imports: [
    HttpModule,
    forwardRef(() => ConfigModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionService, SessionAuthGuard, AdminGuard, LoginRateLimitService, LdapService],
  exports: [AuthService, SessionService, SessionAuthGuard, AdminGuard],
})
export class AuthModule {}
