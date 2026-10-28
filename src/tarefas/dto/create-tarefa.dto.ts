import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, IsOptional, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTarefaDto {
  @ApiPropertyOptional({ example: 10452, description: 'ID único do chamado no GLPI' })
  @IsInt()
  @Type(() => Number)
  @IsOptional()
  chamadoId?: number;

  @ApiPropertyOptional({ example: 'Atualização do Banco de Dados' })
  @IsString()
  nomeTarefa: string;

  @ApiPropertyOptional({ example: 'Executar scripts de migração' })
  @IsString()
  tarefa: string;

  @ApiPropertyOptional({ example: 'Aplicações atualizadas' })
  @IsString()
  @IsOptional()
  resultadoEsperado?: string;

  @ApiPropertyOptional({ example: 'Executar script de rollback' })
  @IsString()
  @IsOptional()
  resultadoAlternativo?: string;

  @ApiPropertyOptional({ example: 'Aguardando janela de homologação' })
  @IsString()
  @IsOptional()
  pendencias?: string;

  @ApiPropertyOptional({ example: [102, 108], type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  analistasIds?: number[];
}