import { Module } from '@nestjs/common';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';
import { TarefasModule } from '../tarefas/tarefas.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GlpiModule } from '../glpi/glpi.module';

@Module({
  imports: [TarefasModule, AuthModule, PrismaModule, GlpiModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
})
export class RelatoriosModule {}
