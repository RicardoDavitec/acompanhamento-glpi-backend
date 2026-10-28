import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { PreviewSyncDto, ConfirmSyncDto } from './dto/sync-glpi.dto';
import { SessionUser } from '../auth/session.types';

@Injectable()
export class GlpiService {
  private readonly logger = new Logger(GlpiService.name);
  private readonly persistentSessions = new Set<string>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Converte strings de data ou Date objects para garantir que os dígitos
   * exatos do horário local de Brasília sejam gravados na coluna DATETIME do MySQL via Prisma.
   */
  public parseDateForDb(dateInput: string | Date): Date {
    if (!dateInput) return new Date();

    const str = typeof dateInput === 'string' ? dateInput.trim() : dateInput.toISOString();
    if (!str) return new Date();

    if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
      const cleanStr = str.replace(' ', 'T');
      const [datePart, timePart = '00:00:00'] = cleanStr.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute, second] = timePart.split(':').map((v) => Number(v.substring(0, 2)));

      return new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
    }

    const d = new Date(str);
    if (isNaN(d.getTime())) return new Date();

    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getP = (type: string) => parts.find((p) => p.type === type)?.value || '00';

    const year = Number(getP('year'));
    const month = Number(getP('month'));
    const day = Number(getP('day'));
    let hour = Number(getP('hour'));
    if (hour === 24) hour = 0;
    const minute = Number(getP('minute'));
    const second = Number(getP('second'));

    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  /**
   * URL e App-Token do GLPI. O registro ativo em system_config tem prioridade.
   * GLPI_URL e GLPI_APP_TOKEN do .env só entram se o banco não tiver os dois preenchidos
   * ou se a leitura do banco falhar.
   */
  private async getGlobalGlpiConfig(): Promise<{ glpiUrl?: string | null; glpiAppToken?: string | null }> {
    try {
      const config = await this.configService.getActiveConfig();
      if (config?.glpiUrl?.trim() && config?.glpiAppToken?.trim()) {
        return config;
      }
      this.logger.warn(
        'Registro ativo do banco sem URL ou App-Token do GLPI; usando GLPI_URL e GLPI_APP_TOKEN do .env.',
      );
    } catch (error: any) {
      this.logger.error(`Não foi possível ler a configuração do GLPI no banco: ${error?.message ?? error}`);
    }

    return {
      glpiUrl: process.env.GLPI_URL,
      glpiAppToken: process.env.GLPI_APP_TOKEN,
    };
  }

  private async getGlpiConfig(identity?: SessionUser | string) {
    const sessionConfig = typeof identity === 'object' && identity
      ? await this.prisma.systemConfig.findUnique({ where: { ambiente: identity.ambiente } }).catch(() => null)
      : null;
    const config = sessionConfig?.glpiAppToken ? sessionConfig : await this.getGlobalGlpiConfig();

    if (!config || !config.glpiUrl || !config.glpiAppToken) {
      throw new BadRequestException(
        'Configurações globais do GLPI (URL ou App-Token) não foram cadastradas no sistema.',
      );
    }

    if (typeof identity === 'object' && identity?.glpiSessionToken) {
      return {
        baseUrl: identity.glpiUrl.replace(/\/+$/, ''),
        appToken: config.glpiAppToken,
        sessionToken: identity.glpiSessionToken,
      };
    }

    if (!identity) {
      throw new BadRequestException(
        'Você precisa cadastrar o seu User Token do GLPI no perfil antes de realizar esta operação.',
      );
    }

    const baseUrl = config.glpiUrl.replace(/\/+$/, '');

    return {
      baseUrl,
      appToken: config.glpiAppToken,
      userToken: identity as string,
    };
  }

  private async initSession(config: { baseUrl: string; appToken: string; userToken?: string; sessionToken?: string }): Promise<string> {
    if (config.sessionToken) {
      this.persistentSessions.add(config.sessionToken);
      return config.sessionToken;
    }
    try {
      const response: any = await firstValueFrom(
        this.httpService.get(`${config.baseUrl}/initSession`, {
          headers: {
            'App-Token': config.appToken,
            Authorization: `user_token ${config.userToken}`,
          },
        }),
      );
      return response.data.session_token;
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Erro ao autenticar no GLPI';
      throw new BadRequestException(`Falha ao iniciar sessão no GLPI: ${message}`);
    }
  }

  private async killSession(baseUrl: string, appToken: string, sessionToken: string): Promise<void> {
    if (this.persistentSessions.has(sessionToken)) return;
    try {
      await firstValueFrom(
        this.httpService.get(`${baseUrl}/killSession`, {
          headers: {
            'App-Token': appToken,
            'Session-Token': sessionToken,
          },
        }),
      );
    } catch {
      // Ignora falhas ao fechar sessão
    }
  }

  private isOverlapping(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
    return startA < endB && endA > startB;
  }

  async testConnection(userToken: SessionUser | string) {
    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);
    await this.killSession(config.baseUrl, config.appToken, sessionToken);

    return {
      success: true,
      message: 'Conexão e autenticação com a API do GLPI realizadas com sucesso!',
    };
  }

  async getTechnicalGroups(userToken?: SessionUser | string) {
    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);

    try {
      const response: any = await firstValueFrom(
        this.httpService.get(`${config.baseUrl}/Group`, {
          headers: {
            'App-Token': config.appToken,
            'Session-Token': sessionToken,
          },
          params: {
            range: '0-100',
          },
        }),
      );

      return (response.data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
      }));
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Erro ao buscar grupos do GLPI: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      await this.killSession(config.baseUrl, config.appToken, sessionToken);
    }
  }

  async getGroupTechnicians(groupId: number, userToken?: SessionUser | string) {
    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);

    try {
      const response: any = await firstValueFrom(
        this.httpService.get(`${config.baseUrl}/Group/${groupId}/Group_User`, {
          headers: {
            'App-Token': config.appToken,
            'Session-Token': sessionToken,
          },
        }),
      );

      const usersGroup: any[] = response.data || [];

      const technicianPromises = usersGroup
        .filter((item) => !!item.users_id)
        .map(async (item) => {
          try {
            const userResp: any = await firstValueFrom(
              this.httpService.get(`${config.baseUrl}/User/${item.users_id}`, {
                headers: {
                  'App-Token': config.appToken,
                  'Session-Token': sessionToken,
                },
              }),
            );

            const userData = userResp.data as any;
            const realName = userData?.realname || '';
            const firstName = userData?.firstname || '';
            const fullName = `${firstName} ${realName}`.trim();

            return {
              id: userData?.id || item.users_id,
              name: fullName || userData?.name || `Usuário #${item.users_id}`,
            };
          } catch {
            return null;
          }
        });

      const results = await Promise.all(technicianPromises);
      return results.filter((tech): tech is { id: number; name: string } => tech !== null);
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Erro ao buscar técnicos do grupo #${groupId}: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      await this.killSession(config.baseUrl, config.appToken, sessionToken);
    }
  }

  async getGroupTicketsByPeriod(
    groupId: number,
    startDate: string,
    endDate: string,
    limit: number = 100,
    userToken?: SessionUser | string,
  ) {
    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);

    try {
      const response: any = await firstValueFrom(
        this.httpService.get(`${config.baseUrl}/search/Ticket`, {
          headers: {
            'App-Token': config.appToken,
            'Session-Token': sessionToken,
          },
          params: {
            range: `0-${limit}`,
            'criteria[0][field]': '8',
            'criteria[0][searchtype]': 'equals',
            'criteria[0][value]': groupId,
            // O intervalo selecionado controla a agenda, não a existência do
            // chamado. Chamados antigos ainda abertos devem poder ser agendados.
            'forcedisplay[0]': '1',
            'forcedisplay[1]': '2',
            'forcedisplay[2]': '15',
            'forcedisplay[3]': '19',
            'forcedisplay[4]': '12',
          },
        }),
      );

      const rawData = response.data?.data || [];

      return rawData
        .map((item: any) => ({
          id: item['2'] || item.id,
          name: item['1'] || 'Chamado sem título',
          date: item['15'] || 'N/A',
          dateMod: item['19'] || 'N/A',
          status: item['12'],
        }))
        .filter((ticket: any) => {
          const st = String(ticket.status);
          return st !== '5' && st !== '6'; // Exclui Solucionados (5) e Fechados (6)
        });
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Erro ao buscar chamados do grupo #${groupId}: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      await this.killSession(config.baseUrl, config.appToken, sessionToken);
    }
  }

  async addTicketTask(ticketId: number, taskData: any, userToken?: SessionUser | string) {
    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);

    try {
      let contentText = taskData.content || taskData.descricao;

      if (!contentText) {
        contentText = [
          '--- TAREFA PLANEJADA ---',
          `• Título: ${taskData.nomeTarefa || 'N/A'}`,
          `• Escopo: ${taskData.tarefa || 'N/A'}`,
          `• Res. Esperado: ${taskData.resultadoEsperado || 'N/A'}`,
          `• Contingência: ${taskData.resultadoAlternativo || 'N/A'}`,
          `• Pendências: ${taskData.pendencias || 'Nenhuma'}`,
          `• Responsáveis: ${Array.isArray(taskData.analistas) ? taskData.analistas.join(', ') : 'N/A'}`,
        ].join('\n');
      }

      const formatGlpiDate = (dateInput?: string | Date) => {
        if (!dateInput) return undefined;

        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        if (isNaN(date.getTime())) return undefined;

        const formatter = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });

        const parts = formatter.formatToParts(date);
        const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

        const year = getPart('year');
        const month = getPart('month');
        const day = getPart('day');
        let hour = getPart('hour');
        if (hour === '24') hour = '00';
        const minute = getPart('minute');
        const second = getPart('second');

        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
      };

      const techId = taskData.analistaId || taskData.tecnicoId || taskData.users_id_tech;
      const beginDate = formatGlpiDate(taskData.dataInicio || taskData.begin);
      const endDate = formatGlpiDate(taskData.dataFim || taskData.end);

      if (techId) {
        try {
          await firstValueFrom(
            this.httpService.post(
              `${config.baseUrl}/Ticket/${ticketId}/Ticket_User`,
              {
                input: {
                  tickets_id: Number(ticketId),
                  users_id: Number(techId),
                  type: 2,
                },
              },
              {
                headers: {
                  'App-Token': config.appToken,
                  'Session-Token': sessionToken,
                  'Content-Type': 'application/json',
                },
              },
            ),
          );
        } catch {
          // Ignora se o técnico já estiver atribuído
        }
      }

      const inputPayload: any = {
        tickets_id: Number(ticketId),
        content: contentText,
        state: 1,
        is_private: 0,
      };

      if (techId) {
        inputPayload.users_id_tech = Number(techId);
      }

      if (beginDate && endDate) {
        inputPayload.plan = {
          begin: beginDate,
          end: endDate,
        };
        inputPayload.begin = beginDate;
        inputPayload.end = endDate;
      }

      const response: any = await firstValueFrom(
        this.httpService.post(
          `${config.baseUrl}/TicketTask`,
          { input: inputPayload },
          {
            headers: {
              'App-Token': config.appToken,
              'Session-Token': sessionToken,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return {
        success: true,
        message: 'Tarefa registrada e técnico atribuído com sucesso no GLPI.',
        data: response.data,
      };
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Erro ao registrar tarefa no chamado #${ticketId}: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      await this.killSession(config.baseUrl, config.appToken, sessionToken);
    }
  }

  async getTicketInfo(id: number, userToken?: SessionUser | string) {
    if (id <= 0) {
      throw new BadRequestException('O ID do chamado deve ser um número maior que zero.');
    }

    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);

    try {
      const ticketResponse: any = await firstValueFrom(
        this.httpService.get(`${config.baseUrl}/Ticket/${id}`, {
          headers: {
            'App-Token': config.appToken,
            'Session-Token': sessionToken,
          },
        }),
      );

      const ticket = ticketResponse.data;
      return {
        id: ticket.id,
        name: ticket.name,
        content: ticket.content,
        status: ticket.status,
        priority: ticket.priority,
        date: ticket.date,
        dateMod: ticket.date_mod,
        solvedate: ticket.solvedate,
        closedate: ticket.closedate,
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundException(`Chamado #${id} não foi encontrado no GLPI.`);
      }
      throw new InternalServerErrorException(
        `Erro ao buscar chamado #${id} no GLPI: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      await this.killSession(config.baseUrl, config.appToken, sessionToken);
    }
  }

  async deleteTicketTask(ticketId: number, taskId: number, userToken?: SessionUser | string) {
    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);

    try {
      await firstValueFrom(
        this.httpService.delete(
          `${config.baseUrl}/TicketTask/${taskId}?forcepurge=true`,
          {
            headers: {
              'App-Token': config.appToken,
              'Session-Token': sessionToken,
            },
          },
        ),
      );

      return {
        success: true,
        message: `Tarefa #${taskId} do chamado #${ticketId} excluída permanentemente do GLPI.`,
      };
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Erro ao excluir tarefa #${taskId} no GLPI: ${error.response?.data?.message || error.message}`,
      );
    } finally {
      await this.killSession(config.baseUrl, config.appToken, sessionToken);
    }
  }

  async previewSync(params: PreviewSyncDto, userToken: SessionUser | string) {
    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);

    const cleanStartDate = params?.dataInicio ? String(params.dataInicio).trim().substring(0, 10) : '';
    const cleanEndDate = params?.dataFim ? String(params.dataFim).trim().substring(0, 10) : '';

    if (!cleanStartDate || !cleanEndDate) {
      throw new BadRequestException('As datas dataInicio e dataFim são obrigatórias no formato YYYY-MM-DD.');
    }

    try {
      const rawTasks: any[] = [];
      const receivedTaskIds = new Set<string>();
      const pageSize = 100;
      let start = 0;
      while (true) {
        const response: any = await firstValueFrom(
          this.httpService.get(`${config.baseUrl}/TicketTask`, {
            headers: {
              'App-Token': config.appToken,
              'Session-Token': sessionToken,
            },
            params: {
              range: `${start}-${start + pageSize - 1}`,
              sort: 'id',
              order: 'DESC',
            },
          }),
        );
        const page = Array.isArray(response.data) ? response.data : response.data?.data || [];
        const newItems = page.filter((item: any) => {
          const id = String(item.id || item['1'] || '');
          if (!id || receivedTaskIds.has(id)) return false;
          receivedTaskIds.add(id);
          return true;
        });
        rawTasks.push(...newItems);
        const contentRange = String(response.headers?.['content-range'] || '');
        const total = Number(contentRange.split('/')[1]);
        if (page.length < pageSize || newItems.length === 0 || (Number.isFinite(total) && start + page.length >= total)) break;
        start += pageSize;
      }

      const incomingTasks = rawTasks
        .map((t: any) => ({
          glpiTaskId: Number(t.id || t['1']),
          glpiTicketId: Number(t.tickets_id || t['2']),
          tecnicoId: String(t.users_id_tech || t['7'] || ''),
          dataInicio: t.begin || t['10'],
          dataFim: t.end || t['11'],
          descricao: t.content || t['12'] || 'Tarefa GLPI',
          status: Number(t.state) === 2 ? 'CONCLUIDO' : 'PENDENTE',
        }))
        .filter((t: any) => {
          if (!t.dataInicio || !t.dataFim || !t.tecnicoId) return false;

          const taskStart = String(t.dataInicio).substring(0, 10);
          const taskEnd = String(t.dataFim).substring(0, 10);
          return taskStart >= cleanStartDate && taskEnd <= cleanEndDate;
        });

      const uniqueTicketIds = Array.from(new Set<number>(incomingTasks.map((t) => Number(t.glpiTicketId))));
      const ticketStatusMap = new Map<number, string>();

      await Promise.all(
        uniqueTicketIds.map(async (ticketId: number) => {
          try {
            const ticketResp: any = await firstValueFrom(
              this.httpService.get(`${config.baseUrl}/Ticket/${ticketId}`, {
                headers: {
                  'App-Token': config.appToken,
                  'Session-Token': sessionToken,
                },
              }),
            );
            if (ticketResp.data?.status !== undefined) {
              ticketStatusMap.set(ticketId, String(ticketResp.data.status));
            }
          } catch {
            // Se falhar ao buscar o chamado, não bloqueia a execução
          }
        }),
      );

      const activeTasks = incomingTasks.filter((t) => {
        const status = ticketStatusMap.get(t.glpiTicketId);
        return status !== '5' && status !== '6';
      });

      const uniqueTasksMap = new Map<number, typeof activeTasks[0]>();
      for (const task of activeTasks) {
        if (!uniqueTasksMap.has(task.glpiTaskId)) {
          uniqueTasksMap.set(task.glpiTaskId, task);
        }
      }
      const deduplicatedTasks = Array.from(uniqueTasksMap.values());

      const taskIds = deduplicatedTasks.map((t) => t.glpiTaskId);
      const existingAgendamentos = await this.prisma.agendamento.findMany({
        where: {
          glpiTaskId: {
            in: taskIds,
          },
        },
        select: {
          glpiTaskId: true,
        },
      });

      const synchronizedTaskIds = new Set(
        existingAgendamentos
          .map((a) => a.glpiTaskId)
          .filter((id): id is number => id !== null && id !== undefined),
      );

      const pendingTasks = deduplicatedTasks.filter(
        (t) => !synchronizedTaskIds.has(t.glpiTaskId),
      );

      if (pendingTasks.length === 0) {
        return [];
      }

      const startBound = this.parseDateForDb(`${cleanStartDate} 00:00:00`);
      const endBound = this.parseDateForDb(`${cleanEndDate} 23:59:59`);

      const localTasks = await this.prisma.agendamento.findMany({
        where: {
          dataInicio: { gte: startBound },
          dataFim: { lte: endBound },
        },
      });

      const resultadoLista = pendingTasks.map((incoming) => {
        const inStart = this.parseDateForDb(incoming.dataInicio);
        const inEnd = this.parseDateForDb(incoming.dataFim);

        const conflitoLocal = localTasks.find((local) => {
          if (String(local.tecnicoId) !== incoming.tecnicoId) return false;
          return this.isOverlapping(inStart, inEnd, new Date(local.dataInicio), new Date(local.dataFim));
        });

        const conflitoGLPI = pendingTasks.find((other) => {
          if (other.glpiTaskId === incoming.glpiTaskId) return false;
          if (other.tecnicoId !== incoming.tecnicoId) return false;

          const otherStart = this.parseDateForDb(other.dataInicio);
          const otherEnd = this.parseDateForDb(other.dataFim);
          return this.isOverlapping(inStart, inEnd, otherStart, otherEnd);
        });

        const temConflito = !!(conflitoLocal || conflitoGLPI);

        return {
          ...incoming,
          temConflito,
          conflito: temConflito
            ? {
              tipo: conflitoLocal ? 'LOCAL' : 'GLPI',
              motivo: 'Sobreposição de horários detectada para o mesmo técnico.',
              tarefaConflitante: conflitoLocal || conflitoGLPI,
            }
            : null,
        };
      });

      return resultadoLista;
    } catch (error: any) {
      const errorData = error.response?.data;
      let errorMessage = error.message;

      if (Array.isArray(errorData)) {
        errorMessage = errorData.join(' | ');
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      } else if (typeof errorData === 'string') {
        errorMessage = errorData;
      }

      console.error('GLPI PreviewSync Error:', errorData || error);

      throw new InternalServerErrorException(
        `Erro ao gerar prévia de sincronização do GLPI: ${errorMessage}`,
      );
    } finally {
      await this.killSession(config.baseUrl, config.appToken, sessionToken);
    }
  }

  async confirmSync(dto: ConfirmSyncDto, userToken?: SessionUser | string) {
    if (!dto?.tarefasAprovadas || !Array.isArray(dto.tarefasAprovadas) || dto.tarefasAprovadas.length === 0) {
      throw new BadRequestException('Nenhuma tarefa foi enviada para sincronização.');
    }

    try {
      const activeConfig = await this.prisma.systemConfig.findFirst({
        where: { isAtivo: true },
      });
      const ambienteAtivo = typeof userToken === 'object'
        ? userToken.ambiente
        : activeConfig?.ambiente || 'HOMOLOGACAO';

      const uniqueTasksMap = new Map<number, typeof dto.tarefasAprovadas[0]>();
      for (const task of dto.tarefasAprovadas) {
        const taskId = Number(task.glpiTaskId);
        if (!isNaN(taskId) && taskId > 0 && !uniqueTasksMap.has(taskId)) {
          uniqueTasksMap.set(taskId, task);
        }
      }

      const tarefasUnicas = Array.from(uniqueTasksMap.values());

      if (tarefasUnicas.length === 0) {
        throw new BadRequestException('Nenhuma tarefa válida foi informada para sincronização.');
      }

      const operacoes = tarefasUnicas.map((task) => {
        const dataInicio = this.parseDateForDb(task.dataInicio);
        const dataFim = this.parseDateForDb(task.dataFim);

        const parsedTechId = parseInt(String(task.tecnicoId), 10);
        const tecnicoIdNum = isNaN(parsedTechId) ? 0 : parsedTechId;
        const statusVal = task.status || 'PENDENTE';
        const integrationKey = userToken && typeof userToken !== 'string'
          ? `${userToken.ambiente}:${userToken.glpiUrl}:${Number(task.glpiTaskId)}`
          : `legacy:${Number(task.glpiTaskId)}`;

        return this.prisma.agendamento.upsert({
          where: {
            integrationKey,
          },
          update: {
            ambiente: ambienteAtivo,
            ticketId: Number(task.glpiTicketId),
            tecnicoId: tecnicoIdNum,
            tecnicoNome: task.tecnicoNome || null,
            dataInicio,
            dataFim,
            descricao: task.descricao || null,
            status: statusVal,
          },
          create: {
            ambiente: ambienteAtivo,
            glpiTaskId: Number(task.glpiTaskId),
            integrationKey,
            ticketId: Number(task.glpiTicketId),
            tecnicoId: tecnicoIdNum,
            tecnicoNome: task.tecnicoNome || null,
            dataInicio,
            dataFim,
            descricao: task.descricao || 'Sincronizado do GLPI',
            status: statusVal,
          },
        });
      });

      await this.prisma.$transaction(operacoes);

      return {
        success: true,
        message: `${tarefasUnicas.length} tarefas sincronizadas com sucesso.`,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao confirmar sincronização GLPI: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Erro ao persistir sincronização no banco de dados: ${error.message || 'Falha na transação'}`,
      );
    }
  }

  async completeTicketTask(taskId: number, userToken?: SessionUser | string) {
    const config = await this.getGlpiConfig(userToken);
    const sessionToken = await this.initSession(config);

    try {
      await firstValueFrom(
        this.httpService.put(
          `${config.baseUrl}/TicketTask/${taskId}`,
          { input: { id: taskId, state: 2 } },
          {
            headers: {
              'App-Token': config.appToken,
              'Session-Token': sessionToken,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      await this.prisma.agendamento.updateMany({
        where: { glpiTaskId: Number(taskId) },
        data: { status: 'CONCLUIDO' },
      });

      return { success: true, message: 'Tarefa marcada como concluída com sucesso!' };
    } catch (error: any) {
      throw new InternalServerErrorException(`Erro ao concluir tarefa no GLPI: ${error.message}`);
    } finally {
      await this.killSession(config.baseUrl, config.appToken, sessionToken);
    }
  }

  async getUserById(userId: number, userToken?: SessionUser | string): Promise<{ id: number; name: string; firstname?: string; realname?: string } | null> {
    const config = await this.getGlpiConfig(userToken);
    let sessionToken: string | null = null;

    try {
      sessionToken = await this.initSession(config);

      const response: any = await firstValueFrom(
        this.httpService.get(`${config.baseUrl}/User/${userId}`, {
          headers: {
            'App-Token': config.appToken,
            'Session-Token': sessionToken,
          },
        }),
      );

      return response.data || null;
    } catch (error: any) {
      this.logger.warn(`Erro ao buscar usuário #${userId} no GLPI: ${error.message}`);
      return null;
    } finally {
      if (sessionToken) {
        await this.killSession(config.baseUrl, config.appToken, sessionToken);
      }
    }
  }
}
