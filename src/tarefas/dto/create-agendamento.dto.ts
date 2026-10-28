import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAgendamentoDto {
  @ApiPropertyOptional({ example: 123, description: 'ID da tarefa gerada no GLPI' })
  @IsInt()
  @Type(() => Number)
  @IsOptional()
  glpiTaskId?: number;


  @ApiProperty({ example: 1594, description: 'ID do chamado no GLPI' })
  @IsInt()
  @Type(() => Number)
  ticketId: number;

  @ApiProperty({ example: 821, description: 'ID do técnico no GLPI' })
  @IsInt()
  @Type(() => Number)
  tecnicoId: number;

  @ApiPropertyOptional({ example: 'Ricardo David', description: 'Nome do técnico' })
  @IsString()
  @IsOptional()
  tecnicoNome?: string;

  @ApiProperty({ example: '2026-08-24T09:00:00.000Z', description: 'Data/Hora de início' })
  @IsDateString()
  dataInicio: string;

  @ApiProperty({ example: '2026-08-24T10:00:00.000Z', description: 'Data/Hora de término' })
  @IsDateString()
  dataFim: string;

  @ApiPropertyOptional({ example: 'Validação e Aprovação', description: 'Descrição/Escopo da tarefa' })
  @IsString()
  @IsOptional()
  descricao?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
