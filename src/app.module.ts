import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TarefasModule } from './tarefas/tarefas.module';
import { ConfigModule } from './config/config.module';
import { GlpiModule } from './glpi/glpi.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true }), // Carrega o .env globalmente
    PrismaModule,
    TarefasModule,
    ConfigModule,
    GlpiModule,
    RelatoriosModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
