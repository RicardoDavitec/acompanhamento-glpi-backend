import { Module } from '@nestjs/common';
import { TarefasService } from './tarefas.service';
import { TarefasController } from './tarefas.controller';
import { GlpiModule } from '../glpi/glpi.module'; // Importe o modulo do GLPI
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [GlpiModule, AuthModule], // Adicione aqui
  providers: [TarefasService],
  controllers: [TarefasController],
  exports: [TarefasService],
})
export class TarefasModule {}
