import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsNumber, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class TechDto {
  @ApiProperty({ example: 102, description: 'ID do analista' })
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @ApiProperty({ example: 'Carlos Silva', description: 'Nome completo do analista' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class ActivityDto {
  @ApiProperty({ example: 102, description: 'ID do analista responsável' })
  @IsNumber()
  @IsNotEmpty()
  techId: number;

  @ApiProperty({ example: '2026-08-10', description: 'Data da atividade (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: 'Carlos Silva', description: 'Nome do analista responsável' })
  @IsString()
  @IsNotEmpty()
  tech: string;

  @ApiProperty({ example: 'CHAMADO', description: 'Tipo da atividade (CHAMADO, PROJETO, etc.)' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: '1042', description: 'ID da atividade ou chamado' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'Correção de rota na API backend', description: 'Descrição da tarefa' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: 'MANHÃ', enum: ['MANHÃ', 'TARDE', 'INTEGRAL'], description: 'Período da execução' })
  @IsString()
  @IsNotEmpty()
  period: 'MANHÃ' | 'TARDE' | 'INTEGRAL';
}

export class SemanaTrabalhoDto {
  @ApiProperty({
    example: '2026-08-10',
    description: 'Data da Segunda-feira da semana de trabalho (YYYY-MM-DD)',
  })
  @IsString()
  @IsNotEmpty()
  startMonday: string;

  @ApiProperty({
    type: [TechDto],
    description: 'Lista de analistas que terão abas geradas na planilha',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TechDto)
  techs: TechDto[];

  @ApiProperty({
    type: [ActivityDto],
    description: 'Lista de atividades e chamados coletados do GLPI',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityDto)
  activities: ActivityDto[];
}
