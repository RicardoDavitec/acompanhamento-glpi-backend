import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, Matches, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ResolvedTaskDto {
  @ApiProperty({ example: 123 })
  @IsNumber()
  glpiTaskId: number;

  @ApiProperty({ example: 456 })
  @IsNumber()
  glpiTicketId: number;

  @ApiProperty({ example: '78' })
  @IsString()
  tecnicoId: string;

  @ApiPropertyOptional({ example: 'João Silva' })
  @IsOptional()
  @IsString()
  tecnicoNome?: string;

  @ApiProperty({ example: '2026-08-10T08:00:00Z' })
  @IsString()
  dataInicio: string;

  @ApiProperty({ example: '2026-08-10T12:00:00Z' })
  @IsString()
  dataFim: string;

  @ApiPropertyOptional({ example: 'Manutenção realizada' })
  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ConfirmSyncDto {
  @ApiProperty({ type: [ResolvedTaskDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResolvedTaskDto)
  tarefasAprovadas: ResolvedTaskDto[];
}

export class PreviewSyncDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsNotEmpty({ message: 'A dataInicio é obrigatória.' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'dataInicio deve estar no formato YYYY-MM-DD.' })
  dataInicio: string;

  @ApiProperty({ example: '2026-08-31' })
  @IsNotEmpty({ message: 'A dataFim é obrigatória.' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'dataFim deve estar no formato YYYY-MM-DD.' })
  dataFim: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  groupId?: number;
}