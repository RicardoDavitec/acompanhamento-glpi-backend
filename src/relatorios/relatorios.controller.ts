import { Controller, Post, Body, Res, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import { RelatoriosService } from './relatorios.service';
import { SemanaTrabalhoDto } from './dto/semana-trabalho.dto';
import { GerarRelatorioAgendaDto } from './dto/gerar-relatorio-agenda.dto';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@ApiTags('relatorios')
@UseGuards(SessionAuthGuard)
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Post('semana-trabalho/excel')
  @ApiOperation({ summary: 'Gera e faz o download do arquivo Excel da Semana de Trabalho' })
  @ApiBody({
    type: SemanaTrabalhoDto,
    examples: {
      exemploPadrao: {
        summary: 'Exemplo Padrão de Semana de Trabalho',
        description: 'Exemplo de payload pré-preenchido com atividades e analistas',
        value: {
          startMonday: '2026-08-10',
          techs: [
            { name: 'Carlos Silva' },
            { name: 'Ana Souza' },
          ],
          activities: [
            {
              date: '2026-08-10',
              tech: 'Carlos Silva',
              type: 'CHAMADO',
              id: '1042',
              content: 'Correção de rota na API backend',
              period: 'MANHÃ',
            },
            {
              date: '2026-08-11',
              tech: 'Ana Souza',
              type: 'PROJETO',
              id: '1045',
              content: 'Ajustes de segurança no Gateway',
              period: 'TARDE',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Arquivo XLSX gerado e retornado com sucesso.' })
  async downloadSemanaTrabalhoExcel(@Body() dto: GerarRelatorioAgendaDto, @Request() req: any, @Res() res: Response) {
    const buffer = await this.relatoriosService.gerarPlanilhaDaAgenda(dto, req.user);

    const fileName = `DTI-SW_QTD_${dto.dataInicio}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }
}
