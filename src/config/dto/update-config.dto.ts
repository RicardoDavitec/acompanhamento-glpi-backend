import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateConfigDto {
  @ApiPropertyOptional({
    example: 'https://glpi.suaempresa.com.br/apirest.php',
    description: 'URL base do endpoint REST da API do GLPI',
  })
  @IsString()
  @IsOptional()
  glpiUrl?: string;

  @ApiPropertyOptional({
    example: 'user_token',
    description: 'Modo de autenticação do GLPI (ex: user_token ou basic)',
  })
  @IsString()
  @IsOptional()
  glpiAuthMode?: string;

  @ApiPropertyOptional({
    example: 'xptoAppToken123456789',
    description: 'App-Token gerado na API do GLPI',
  })
  @IsString()
  @IsOptional()
  glpiAppToken?: string;

  @ApiPropertyOptional({
    example: 'usuario.glpi',
    description: 'Usuário do GLPI gravado em system_config',
  })
  @IsString()
  @IsOptional()
  glpiUser?: string;

  @ApiPropertyOptional({
    example: 'abcUserToken987654321',
    description: 'User-Token do usuário do GLPI para autorização',
  })
  @IsString()
  @IsOptional()
  glpiUserToken?: string;

  @ApiPropertyOptional({
    example: 'https://gitness.suaempresa.com.br',
    description: 'URL base da instância do Gitness',
  })
  @IsString()
  @IsOptional()
  gitnessUrl?: string;

  @ApiPropertyOptional({
    example: 'pat',
    description: 'Modo de autenticação do Gitness (ex: pat - Personal Access Token)',
  })
  @IsString()
  @IsOptional()
  gitnessAuthMode?: string;

  @ApiPropertyOptional({
    example: 'pat_token_gitness_12345',
    description: 'Token de acesso para requisições na API do Gitness',
  })
  @IsString()
  @IsOptional()
  gitnessAccessToken?: string;
}