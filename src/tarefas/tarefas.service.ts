import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTarefaDto } from './dto/create-tarefa.dto';
import { UpdateTarefaDto } from './dto/update-tarefa.dto';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { GlpiService } from '../glpi/glpi.service';
import { SessionUser } from '../auth/session.types';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit.service';

export interface ListarAgendamentosFiltros {
  tecnicoId?: number;
  grupoId?: number;
  dataInicio?: string;
  dataFim?: string;
  ambiente?: string;
}

@Injectable()
export class TarefasService {
  private readonly logger = new Logger(TarefasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly glpiService: GlpiService,
    private readonly audit: AuditService,
  ) {}

  private async getConfiguracaoAtiva() {
    try {
      const config = await this.prisma.systemConfig.findFirst({
        where: { isAtivo: true },
      });

      if (config) {
        return {
          ...config,
          glpiUrl: config.glpiUrl?.trim() ? config.glpiUrl : process.env.GLPI_URL,
        };
      }
    } catch (error: any) {
      this.logger.warn(`Configuração ativa indisponível no banco: ${error?.message ?? error}`);
    }

    return {
      ambiente: process.env.AMBIENTE || 'HOMOLOGACAO',
      glpiUrl: process.env.GLPI_URL,
    };
  }

  private formatarDataParaGlpi(dataInput: string | Date): string {
    if (typeof dataInput === 'string') {
      const limpa = dataInput.replace('T', ' ').substring(0, 19);
      return limpa.length === 10 ? `${limpa} 00:00:00` : limpa;
    }
    const ano = dataInput.getFullYear();
    const mes = String(dataInput.getMonth() + 1).padStart(2, '0');
    const dia = String(dataInput.getDate()).padStart(2, '0');
    const hora = String(dataInput.getHours()).padStart(2, '0');
    const minuto = String(dataInput.getMinutes()).padStart(2, '0');
    const segundo = String(dataInput.getSeconds()).padStart(2, '0');
    return `${ano}-${mes}-${dia} ${hora}:${minuto}:${segundo}`;
  }

  private parseAnalistasIds(rawJson?: string | null): number[] {
    if (!rawJson) return [];
    try {
      return JSON.parse(rawJson);
    } catch {
      return [];
    }
  }

  // --- MÉTODOS DE TAREFAS PLANEJADAS ---

  async create(dto: CreateTarefaDto) {
    const analistas = Array.isArray(dto.analistasIds) ? dto.analistasIds : [];

    const tarefa = await this.prisma.tarefaPlanejada.create({
      data: {
        nomeTarefa: dto.nomeTarefa,
        tarefa: dto.tarefa,
        resultadoEsperado: dto.resultadoEsperado,
        resultadoAlternativo: dto.resultadoAlternativo,
        pendencias: dto.pendencias,
        chamadoId: dto.chamadoId ?? undefined,
        analistasIds: JSON.stringify(analistas),
      },
    });

    return {
      ...tarefa,
      analistasIds: this.parseAnalistasIds(tarefa.analistasIds),
    };
  }

  async findAll() {
    const tarefas = await this.prisma.tarefaPlanejada.findMany();
    return tarefas.map((t) => ({
      ...t,
      analistasIds: this.parseAnalistasIds(t.analistasIds),
    }));
  }

  async findOne(id: number) {
    const t = await this.prisma.tarefaPlanejada.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Tarefa com ID ${id} não encontrada.`);
    return {
      ...t,
      analistasIds: this.parseAnalistasIds(t.analistasIds),
    };
  }

  async update(id: number, dto: UpdateTarefaDto) {
    await this.findOne(id);

    const dataToUpdate: any = {};

    if (dto.nomeTarefa !== undefined) dataToUpdate.nomeTarefa = dto.nomeTarefa;
    if (dto.tarefa !== undefined) dataToUpdate.tarefa = dto.tarefa;
    if (dto.resultadoEsperado !== undefined) dataToUpdate.resultadoEsperado = dto.resultadoEsperado;
    if (dto.resultadoAlternativo !== undefined) dataToUpdate.resultadoAlternativo = dto.resultadoAlternativo;
    if (dto.pendencias !== undefined) dataToUpdate.pendencias = dto.pendencias;

    if (dto.chamadoId !== undefined) {
      dataToUpdate.chamadoId = dto.chamadoId ?? undefined;
    }

    if (dto.analistasIds !== undefined) {
      dataToUpdate.analistasIds = JSON.stringify(dto.analistasIds || []);
    }

    const t = await this.prisma.tarefaPlanejada.update({
      where: { id },
      data: dataToUpdate,
    });

    return {
      ...t,
      analistasIds: this.parseAnalistasIds(t.analistasIds),
    };
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.tarefaPlanejada.delete({ where: { id } });
    return { message: `Tarefa com ID ${id} removida com sucesso.` };
  }

  private async obterNomeTecnico(tecnicoId: number, session: SessionUser): Promise<string | null> {
    try {
      const tecnico = await this.glpiService.getUserById(tecnicoId, session);
      if (tecnico) {
        const nomeCompleto = `${tecnico.firstname || ''} ${tecnico.realname || ''}`.trim();
        return nomeCompleto || tecnico.name || null;
      }
    } catch (error: any) {
      this.logger.warn(`Não foi possível buscar nome do técnico #${tecnicoId}: ${error.message}`);
    }
    return null;
  }

  // --- MÉTODOS DE AGENDAMENTOS ---

  async criarAgendamento(dto: CreateAgendamentoDto, session: SessionUser) {
    const ambienteAtual = session.ambiente;
    const idempotencyKey = dto.idempotencyKey || randomUUID();

    const existente = await this.prisma.agendamento.findFirst({ where: { idempotencyKey } });
    if (existente?.status === 'AGUARDANDO_CONFIRMACAO') {
      throw new ConflictException(`O agendamento #${existente.id} ainda aguarda confirmação no GLPI.`);
    }
    if (existente) return existente;

    // 1. Usa o parseDateForDb para garantir que 08:00 seja salvo exatamente como 08:00:00.000
    const inicio = this.glpiService.parseDateForDb(dto.dataInicio);
    const fim = this.glpiService.parseDateForDb(dto.dataFim);

    if (inicio >= fim) {
      throw new BadRequestException('A data de início deve ser anterior à data de término.');
    }

    let tecnicoNome = dto.tecnicoNome;
    if (!tecnicoNome && dto.tecnicoId) {
      tecnicoNome = (await this.obterNomeTecnico(dto.tecnicoId, session)) || undefined;
    }

    // 2. Valida conflito
    const conflito = await this.prisma.agendamento.findFirst({
      where: {
        ambiente: ambienteAtual,
        glpiUrl: session.glpiUrl,
        canceladoEm: null,
        tecnicoId: dto.tecnicoId,
        dataInicio: { lt: fim },
        dataFim: { gt: inicio },
      },
    });

    if (conflito) {
      const timeZoneOptions: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC', // Mantém UTC na exibição da mensagem de erro de conflito
      };

      const horaInicioStr = new Date(conflito.dataInicio).toLocaleTimeString('pt-BR', timeZoneOptions);
      const horaFimStr = new Date(conflito.dataFim).toLocaleTimeString('pt-BR', timeZoneOptions);

      throw new BadRequestException(
        `O analista ${tecnicoNome || dto.tecnicoId} já possui a tarefa do chamado #${conflito.ticketId} agendada das ${horaInicioStr} às ${horaFimStr}.`,
      );
    }

    // Confirma que o chamado ainda existe e está aberto antes de reservar o horário.
    const ticket = await this.glpiService.getTicketInfo(dto.ticketId, session);
    if ([5, 6].includes(Number(ticket.status))) {
      throw new BadRequestException(`O chamado #${dto.ticketId} já está concluído ou fechado no GLPI.`);
    }

    let taskIdFromGlpi: number | null = dto.glpiTaskId || null;
    const pendente = await this.prisma.agendamento.create({
      data: {
        ambiente: ambienteAtual,
        glpiUrl: session.glpiUrl,
        idempotencyKey,
        ticketId: dto.ticketId,
        tecnicoId: dto.tecnicoId,
        tecnicoNome,
        dataInicio: inicio,
        dataFim: fim,
        descricao: dto.descricao,
        glpiTaskId: taskIdFromGlpi,
        status: 'CRIACAO_PENDENTE',
        criadoPorId: session.userId,
      },
    });

    // 3. Cria no GLPI se necessário
    if (!taskIdFromGlpi && dto.ticketId) {
      try {
        const glpiResponse = await this.glpiService.addTicketTask(dto.ticketId, {
          content: dto.descricao,
          analistaId: dto.tecnicoId,
          dataInicio: this.formatarDataParaGlpi(dto.dataInicio),
          dataFim: this.formatarDataParaGlpi(dto.dataFim),
        }, session);
        const resData = glpiResponse?.data;
        taskIdFromGlpi = Array.isArray(resData) ? resData[0]?.id : resData?.id || null;
        if (!taskIdFromGlpi) throw new Error('O GLPI não retornou o ID da tarefa criada.');
      } catch (error: any) {
        await this.prisma.agendamento.update({
          where: { id: pendente.id },
          data: { status: 'AGUARDANDO_CONFIRMACAO' },
        });
        await this.audit.record({ userId: session.userId, ambiente: ambienteAtual, action: 'CRIAR', entity: 'AGENDAMENTO', entityId: pendente.id, result: 'AGUARDANDO_CONFIRMACAO', details: { ticketId: dto.ticketId } });
        throw new BadRequestException(`Não foi possível confirmar a criação no GLPI. O agendamento #${pendente.id} ficou aguardando confirmação; não clique novamente.`);
      }
    }

    // 4. Finaliza a operação persistida somente depois da confirmação do GLPI.
    const agendamento = await this.prisma.agendamento.update({
      where: { id: pendente.id },
      data: {
        glpiTaskId: taskIdFromGlpi,
        integrationKey: `${ambienteAtual}:${session.glpiUrl}:${taskIdFromGlpi}`,
        status: 'PENDENTE',
      },
    });
    await this.audit.record({ userId: session.userId, ambiente: ambienteAtual, action: 'CRIAR', entity: 'AGENDAMENTO', entityId: agendamento.id, result: 'SUCESSO', details: { ticketId: dto.ticketId, glpiTaskId: taskIdFromGlpi } });
    return agendamento;
  }

  async listarAgendamentos(filtros: ListarAgendamentosFiltros | undefined, session: SessionUser) {
    const ambienteAtual = filtros?.ambiente || session.ambiente;
    const { tecnicoId, grupoId, dataInicio, dataFim } = filtros || {};

    const where: any = {
      ambiente: ambienteAtual,
      glpiUrl: session.glpiUrl,
      canceladoEm: null,
    };

    if (tecnicoId && !isNaN(Number(tecnicoId)) && Number(tecnicoId) > 0) {
      where.tecnicoId = Number(tecnicoId);
    } else if (grupoId && !isNaN(Number(grupoId)) && Number(grupoId) > 0) {
      try {
        const tecnicos = await this.glpiService.getGroupTechnicians(grupoId, session);

        if (tecnicos && tecnicos.length > 0) {
          const idsTecnicos = tecnicos.map((t: any) => Number(t.id));
          where.tecnicoId = { in: idsTecnicos };
        } else {
          return [];
        }
      } catch (error: any) {
        this.logger.warn(`Erro ao buscar técnicos do grupo ${grupoId}: ${error.message}`);
      }
    }

    if (dataInicio || dataFim) {
      where.dataInicio = {};

      if (dataInicio) {
        const cleanDateStr = `${dataInicio.substring(0, 10)} 00:00:00`;
        where.dataInicio.gte = this.glpiService.parseDateForDb(cleanDateStr);
      }

      if (dataFim) {
        const cleanDateStr = `${dataFim.substring(0, 10)} 23:59:59`;
        where.dataInicio.lte = this.glpiService.parseDateForDb(cleanDateStr);
      }
    }

    const agendamentos = await this.prisma.agendamento.findMany({
      where,
      orderBy: { dataInicio: 'asc' },
    });

    return Promise.all(
      agendamentos.map(async (item) => {
        if (!item.tecnicoNome && item.tecnicoId) {
          const nomeResolvido = await this.obterNomeTecnico(item.tecnicoId, session);
          if (nomeResolvido) {
            this.prisma.agendamento
              .update({
                where: { id: item.id },
                data: { tecnicoNome: nomeResolvido },
              })
              .catch((err) =>
                this.logger.warn(`Falha ao persistir nome do técnico #${item.tecnicoId}: ${err.message}`),
              );

            return { ...item, tecnicoNome: nomeResolvido };
          }
        }
        return item;
      }),
    );
  }

  async removerAgendamento(id: number, session: SessionUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id } });
    if (!agendamento) throw new NotFoundException(`Agendamento #${id} não encontrado.`);

    if (agendamento.glpiTaskId && agendamento.ticketId) {
      try {
        await this.glpiService.deleteTicketTask(
          Number(agendamento.ticketId),
          Number(agendamento.glpiTaskId),
          session,
        );
      } catch (error: any) {
        throw new BadRequestException(`O GLPI não confirmou o cancelamento: ${error.message}`);
      }
    }
    await this.prisma.agendamento.update({ where: { id }, data: { canceladoEm: new Date(), status: 'CANCELADO' } });
    await this.audit.record({ userId: session.userId, ambiente: session.ambiente, action: 'CANCELAR', entity: 'AGENDAMENTO', entityId: id, result: 'SUCESSO', details: { glpiTaskId: agendamento.glpiTaskId } });
    return { message: `Agendamento #${id} cancelado com sucesso.` };
  }

  async concluirAgendamento(id: number, session: SessionUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id } });
    if (!agendamento?.glpiTaskId) throw new NotFoundException('Agendamento GLPI não encontrado.');
    const result = await this.glpiService.completeTicketTask(agendamento.glpiTaskId, session);
    await this.audit.record({ userId: session.userId, ambiente: session.ambiente, action: 'CONCLUIR', entity: 'AGENDAMENTO', entityId: id, result: 'SUCESSO', details: { glpiTaskId: agendamento.glpiTaskId } });
    return result;
  }
}
