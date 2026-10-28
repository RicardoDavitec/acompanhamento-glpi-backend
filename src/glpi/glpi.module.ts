import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GlpiController } from './glpi.controller';
import { GlpiService } from './glpi.service';
import { ConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [HttpModule, ConfigModule, AuthModule],
  controllers: [GlpiController],
  providers: [GlpiService],
  exports: [GlpiService],
})
export class GlpiModule {}
