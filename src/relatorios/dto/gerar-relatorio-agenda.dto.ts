import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsInt, IsOptional } from 'class-validator';

export class GerarRelatorioAgendaDto {
  @ApiProperty({ example: '2026-10-05' })
  @IsDateString()
  dataInicio: string;

  @ApiProperty({ example: '2026-10-09' })
  @IsDateString()
  dataFim: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  grupoId?: number;

  @ApiProperty({ example: [15, 21], type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  analistasIds: number[];
}
