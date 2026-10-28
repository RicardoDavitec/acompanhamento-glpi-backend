import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TarefasService } from './tarefas.service';
import { CreateTarefaDto } from './dto/create-tarefa.dto';
import { UpdateTarefaDto } from './dto/update-tarefa.dto';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@ApiTags('tarefas')
@UseGuards(SessionAuthGuard)
@Controller('tarefas')
export class TarefasController {
  constructor(private readonly tarefasService: TarefasService) {}

  // --- ROTAS DE AGENDAMENTOS DE HORÁRIOS ---

  @Post('agendamentos')
  @ApiOperation({ summary: 'Valida choque de horário e registra um novo agendamento' })
  @ApiResponse({ status: 201, description: 'Agendamento registrado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Conflito de horário ou dados inválidos.' })
  criarAgendamento(@Body() createAgendamentoDto: CreateAgendamentoDto, @Request() req: any) {
    return this.tarefasService.criarAgendamento(createAgendamentoDto, req.user);
  }

  @Get('agendamentos')
  @ApiOperation({ summary: 'Lista os agendamentos registrados' })
  @ApiQuery({ name: 'tecnicoId', required: false, description: 'Filtrar por ID do técnico' })
  @ApiQuery({ name: 'grupoId', required: false, description: 'Filtrar por ID do grupo GLPI' })
  @ApiQuery({ name: 'dataInicio', required: false, description: 'Data inicial para filtro' })
  @ApiQuery({ name: 'dataFim', required: false, description: 'Data final para filtro' })
  listarAgendamentos(
    @Request() req: any,
    @Query('tecnicoId') tecnicoId?: string,
    @Query('grupoId') grupoId?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    // Trata string 'todos' e previne NaN
    const parsedTecnicoId = tecnicoId && tecnicoId !== 'todos' ? parseInt(tecnicoId, 10) : undefined;
    const parsedGrupoId = grupoId ? parseInt(grupoId, 10) : undefined;

    return this.tarefasService.listarAgendamentos({
      tecnicoId: parsedTecnicoId && !isNaN(parsedTecnicoId) ? parsedTecnicoId : undefined,
      grupoId: parsedGrupoId && !isNaN(parsedGrupoId) ? parsedGrupoId : undefined,
      dataInicio,
      dataFim,
    }, req.user);
  }

  @Delete('agendamentos/:id')
  @ApiOperation({ summary: 'Remove um agendamento' })
  @ApiParam({ name: 'id', description: 'ID do agendamento' })
  removerAgendamento(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.tarefasService.removerAgendamento(id, req.user);
  }

  @Post('agendamentos/:id/concluir')
  concluirAgendamento(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.tarefasService.concluirAgendamento(id, req.user);
  }

  // --- ROTAS DE TAREFAS PLANEJADAS ---

  @Post()
  @ApiOperation({ summary: 'Cria uma nova tarefa planejada' })
  @ApiResponse({ status: 201, description: 'Tarefa criada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados de entrada inválidos.' })
  create(@Body() createTarefaDto: CreateTarefaDto) {
    return this.tarefasService.create(createTarefaDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todas as tarefas cadastradas' })
  @ApiResponse({ status: 200, description: 'Lista de tarefas retornada com sucesso.' })
  findAll() {
    return this.tarefasService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca os detalhes de uma tarefa pelo ID' })
  @ApiParam({ name: 'id', description: 'ID da tarefa', example: 1 })
  @ApiResponse({ status: 200, description: 'Tarefa encontrada.' })
  @ApiResponse({ status: 404, description: 'Tarefa não encontrada.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tarefasService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados de uma tarefa existente' })
  @ApiParam({ name: 'id', description: 'ID da tarefa', example: 1 })
  @ApiResponse({ status: 200, description: 'Tarefa atualizada com sucesso.' })
  @ApiResponse({ status: 404, description: 'Tarefa não encontrada.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateTarefaDto: UpdateTarefaDto) {
    return this.tarefasService.update(id, updateTarefaDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove uma tarefa' })
  @ApiParam({ name: 'id', description: 'ID da tarefa', example: 1 })
  @ApiResponse({ status: 200, description: 'Tarefa removida com sucesso.' })
  @ApiResponse({ status: 404, description: 'Tarefa não encontrada.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tarefasService.remove(id);
  }
}
