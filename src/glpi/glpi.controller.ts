import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { GlpiService } from './glpi.service';
import { PreviewSyncDto, ConfirmSyncDto } from './dto/sync-glpi.dto';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@ApiTags('glpi')
@UseGuards(SessionAuthGuard)
@Controller('glpi')
export class GlpiController {
  constructor(private readonly glpiService: GlpiService) {}

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Testa a conexão e autenticação com a API do GLPI' })
  @ApiResponse({ status: 200, description: 'Conexão estabelecida com sucesso.' })
  testConnection(@Request() req: any) {
    return this.glpiService.testConnection(req.user);
  }

  @Get('grupos')
  @ApiOperation({ summary: 'Lista os grupos técnicos cadastrados no GLPI' })
  @ApiResponse({ status: 200, description: 'Lista de grupos retornada com sucesso.' })
  getTechnicalGroups(@Request() req: any) {
    return this.glpiService.getTechnicalGroups(req.user);
  }

  @Get('grupos/:id/tecnicos')
  @ApiOperation({ summary: 'Lista os analistas/técnicos de um grupo técnico' })
  @ApiParam({ name: 'id', description: 'ID do grupo no GLPI', example: 1 })
  getGroupTechnicians(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.glpiService.getGroupTechnicians(id, req.user);
  }

  @Get('grupos/:id/chamados')
  @ApiOperation({ summary: 'Lista os chamados do grupo filtrados por período de data' })
  @ApiParam({ name: 'id', description: 'ID do grupo no GLPI', example: 1 })
  @ApiQuery({ name: 'startDate', description: 'Data Inicial (YYYY-MM-DD)', example: '2026-08-03' })
  @ApiQuery({ name: 'endDate', description: 'Data Final (YYYY-MM-DD)', example: '2026-08-07' })
  @ApiQuery({ name: 'limit', description: 'Quantidade máxima de chamados a retornar', example: 100, required: false })
  getGroupTicketsByPeriod(
    @Param('id', ParseIntPipe) id: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this.glpiService.getGroupTicketsByPeriod(id, startDate, endDate, parsedLimit, req.user);
  }

  @Post('chamados/:id/tarefas')
  @ApiOperation({ summary: 'Registra uma tarefa (TicketTask) no chamado do GLPI' })
  @ApiParam({ name: 'id', description: 'ID do chamado no GLPI', example: 1042 })
  addTicketTask(@Param('id', ParseIntPipe) id: number, @Body() taskData: any, @Request() req: any) {
    return this.glpiService.addTicketTask(id, taskData, req.user);
  }

  @Get('chamados/:id')
  @ApiOperation({ summary: 'Busca os detalhes de um chamado no GLPI pelo ID' })
  @ApiParam({ name: 'id', description: 'ID do chamado no GLPI', example: 1042 })
  getTicketInfo(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.glpiService.getTicketInfo(id, req.user);
  }

  @Delete('chamados/:ticketId/tarefas/:taskId')
  @ApiOperation({ summary: 'Exclui uma tarefa (TicketTask) permanentemente no GLPI' })
  @ApiParam({ name: 'ticketId', description: 'ID do chamado no GLPI', example: 8790 })
  @ApiParam({ name: 'taskId', description: 'ID da tarefa no GLPI', example: 123 })
  deleteTicketTask(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Request() req: any,
  ) {
    return this.glpiService.deleteTicketTask(ticketId, taskId, req.user);
  }

  @Post('sincronizar/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gera prévia das tarefas do GLPI e verifica conflitos locais' })
  @ApiBody({ type: PreviewSyncDto })
  @ApiResponse({ status: 200, description: 'Prévia de sincronização gerada com sucesso.' })
  async previewSync(@Body() body: PreviewSyncDto, @Query() query: any, @Request() req: any) {
    const mergedParams = {
      dataInicio: body?.dataInicio || query?.dataInicio,
      dataFim: body?.dataFim || query?.dataFim,
      groupId: body?.groupId || (query?.groupId ? Number(query.groupId) : undefined),
    };

    return this.glpiService.previewSync(mergedParams, req.user);
  }

  @Post('sincronizar/confirmar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma e persiste as tarefas aprovadas no banco de dados local' })
  @ApiBody({ type: ConfirmSyncDto })
  @ApiResponse({ status: 200, description: 'Tarefas sincronizadas com sucesso.' })
  @ApiResponse({ status: 400, description: 'Payload inválido ou sem tarefas.' })
  async confirmSync(@Body() dto: ConfirmSyncDto, @Request() req: any) {
    return this.glpiService.confirmSync(dto, req.user);
  }

  @Post('tarefas/:taskId/concluir')
  @HttpCode(HttpStatus.OK)
  async completeTicketTask(@Param('taskId', ParseIntPipe) taskId: number, @Request() req: any) {
    return this.glpiService.completeTicketTask(taskId, req.user);
  }
}
