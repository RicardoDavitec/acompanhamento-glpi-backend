import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { TarefasService } from '../tarefas/tarefas.service';
import { SemanaTrabalhoDto } from './dto/semana-trabalho.dto';
import { GerarRelatorioAgendaDto } from './dto/gerar-relatorio-agenda.dto';
import { PrismaService } from '../prisma/prisma.service';
import { GlpiService } from '../glpi/glpi.service';
import { SessionUser } from '../auth/session.types';

@Injectable()
export class RelatoriosService {
  constructor(
    private readonly tarefasService: TarefasService,
    private readonly prisma: PrismaService,
    private readonly glpi: GlpiService,
  ) { }

  async gerarPlanilhaDaAgenda(dto: GerarRelatorioAgendaDto, session: SessionUser): Promise<Buffer> {
    const inicio = this.glpi.parseDateForDb(`${dto.dataInicio} 00:00:00`);
    const fim = this.glpi.parseDateForDb(`${dto.dataFim} 23:59:59`);
    let tecnicosPermitidos = dto.analistasIds;
    if (dto.grupoId) {
      const grupo = await this.glpi.getGroupTechnicians(dto.grupoId, session);
      const idsGrupo = new Set(grupo.map((item) => item.id));
      tecnicosPermitidos = tecnicosPermitidos.filter((id) => idsGrupo.has(id));
    }
    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        ambiente: session.ambiente,
        glpiUrl: session.glpiUrl,
        canceladoEm: null,
        tecnicoId: { in: tecnicosPermitidos },
        dataInicio: { lte: fim },
        dataFim: { gte: inicio },
      },
      orderBy: { dataInicio: 'asc' },
    });
    const nomes = new Map<number, string>();
    for (const item of agendamentos) nomes.set(item.tecnicoId, item.tecnicoNome || `Técnico #${item.tecnicoId}`);
    const techs = tecnicosPermitidos.map((id) => ({ id, name: nomes.get(id) || `Técnico #${id}` }));
    const activities = agendamentos.flatMap((item) => {
      const start = new Date(item.dataInicio);
      const end = new Date(item.dataFim);
      const date = start.toISOString().slice(0, 10);
      const parts: Array<'MANHÃ' | 'TARDE'> = [];
      if (start.getUTCHours() < 12) parts.push('MANHÃ');
      if (end.getUTCHours() > 12) parts.push('TARDE');
      return parts.map((period) => ({ date, techId: item.tecnicoId, tech: nomes.get(item.tecnicoId) || `Técnico #${item.tecnicoId}`, type: 'CHAMADO', id: String(item.ticketId), content: item.descricao || 'Tarefa GLPI', period }));
    });
    return this.gerarPlanilhaSemanaTrabalho({ startMonday: dto.dataInicio, techs, activities }, false);
  }

  async gerarPlanilhaSemanaTrabalho(dto: SemanaTrabalhoDto, incluirModelos = true): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const tarefasPlanejadas = incluirModelos ? await this.tarefasService.findAll() : [];

    // Garantia defensiva contra arrays indefinidos/nulos
    const activities = dto.activities || [];
    const techs = dto.techs || [];
    const startMondayStr = dto.startMonday || new Date().toISOString().substring(0, 10);

    const startMondayDate = new Date(`${startMondayStr}T00:00:00`);

    // Estilos Visuais
    const fillHeader = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FF111923' },
    };
    const fontHeader = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF00F0FF' } };
    const fontSub = { name: 'Calibri', size: 10, bold: true };
    const fillAvail = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFE2EFDA' },
    };
    const fontAvail = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF375623' } };

    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    };

    // -------------------------------------------------------------
    // ABA 1: PLANEJAMENTO
    // -------------------------------------------------------------
    const wsPlan = workbook.addWorksheet('planejamento');
    wsPlan.addRow(['DATA', 'ANALISTA', 'TIPO', 'ID GLPI', 'DESCRIÇÃO / TAREFA', 'PERÍODO']);

    const headerRow = wsPlan.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = fillHeader;
      cell.font = fontHeader;
      cell.alignment = { horizontal: 'center' };
    });

    for (const act of activities) {
      wsPlan.addRow([act.date, act.tech, act.type, act.id, act.content, act.period]);
    }

    for (const tp of tarefasPlanejadas) {
      for (const analista of tp.analistasIds) {
        const descCompleta = `${tp.nomeTarefa}: ${tp.tarefa}`;
        const dataFormatada = tp.dataCriacao
          ? new Date(tp.dataCriacao).toISOString().substring(0, 10)
          : '-';

        wsPlan.addRow([dataFormatada, analista, 'PLANEJADA', '-', descCompleta, 'INTEGRAL']);
      }
    }

    // -------------------------------------------------------------
    // ABAS INDIVIDUAIS DOS ANALISTAS
    // -------------------------------------------------------------
    const daysName = ['SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA'];

    const sheetNames = new Set<string>();
    for (const tech of techs) {
      const baseSheetTitle = (tech.name || 'Analista').substring(0, 27);
      let sheetTitle = baseSheetTitle;
      let ordinal = 2;
      while (sheetNames.has(sheetTitle.toLowerCase())) {
        sheetTitle = `${baseSheetTitle.substring(0, 27 - String(ordinal).length)} ${ordinal}`;
        ordinal += 1;
      }
      sheetNames.add(sheetTitle.toLowerCase());
      const wsTech = workbook.addWorksheet(sheetTitle);

      wsTech.mergeCells('A1:F1');
      const titleCell = wsTech.getCell('A1');
      titleCell.value = `QUADRO DE TRABALHO SEMANAL - ${tech.name.toUpperCase()}`;
      titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF111923' } };
      titleCell.alignment = { horizontal: 'center' };

      const headers = ['HORÁRIO / PERÍODO'];
      for (let i = 0; i < 5; i++) {
        const currentDay = new Date(startMondayDate);
        currentDay.setDate(startMondayDate.getDate() + i);
        const dayStr = `${currentDay.getDate().toString().padStart(2, '0')}/${(currentDay.getMonth() + 1).toString().padStart(2, '0')}`;
        headers.push(`${daysName[i]}\n${dayStr}`);
      }

      wsTech.addRow(headers);
      const rowHeader = wsTech.getRow(2);
      rowHeader.eachCell((cell) => {
        cell.fill = fillHeader;
        cell.font = fontHeader;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });

      const timeSlots = [
        { label: '08:00 - 12:00 (Manhã)', type: 'MANHÃ' },
        { label: '12:00 - 13:00 (Almoço)', type: 'ALMOÇO' },
        { label: '13:00 - 17:00 (Tarde)', type: 'TARDE' },
      ];

      for (const slot of timeSlots) {
        const rowValues = [slot.label];

        for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
          const dayDate = new Date(startMondayDate);
          dayDate.setDate(startMondayDate.getDate() + dayIdx);
          const dateStr = dayDate.toISOString().substring(0, 10);

          if (slot.type === 'ALMOÇO') {
            rowValues.push('[ INTERVALO DE ALMOÇO ]');
          } else {
            const matching = activities
              .filter((a) => a.techId === tech.id && a.date === dateStr && a.period === slot.type)
              .map((a) => `[${a.type}] #${a.id}: ${a.content}`);

            for (const tp of tarefasPlanejadas) {
              if (tp.analistasIds.includes(tech.id)) {
                matching.push(`[PLANEJADA] ${tp.nomeTarefa}`);
              }
            }

            if (matching.length > 0) {
              rowValues.push(matching.join('\n'));
            } else {
              rowValues.push('[ DISPONÍVEL ]');
            }
          }
        }

        const addedRow = wsTech.addRow(rowValues);
        addedRow.eachCell((cell) => {
          cell.border = thinBorder;
          cell.alignment = { vertical: 'middle', wrapText: true };

          if (cell.value === '[ DISPONÍVEL ]') {
            cell.fill = fillAvail;
            cell.font = fontAvail;
          } else if (cell.value === '[ INTERVALO DE ALMOÇO ]') {
            cell.font = fontSub;
          }
        });
      }

      wsTech.getColumn(1).width = 24;
      for (let col = 2; col <= 6; col++) {
        wsTech.getColumn(col).width = 28;
      }
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }
}
