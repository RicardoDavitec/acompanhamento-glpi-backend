import { Controller, Get, Put, Patch, Body, Param, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { SessionService } from '../auth/session.service';

@ApiTags('config')
@UseGuards(SessionAuthGuard, AdminGuard)
@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService, private readonly sessions: SessionService) {}

  @Get()
  @ApiOperation({ summary: 'Obtém todas as configurações (Produção e Homologação)' })
  @ApiResponse({ status: 200, description: 'Configurações retornadas com sucesso.' })
  getAllConfigs() {
    return this.configService.getAllConfigs().then(ocultarSegredos).catch((error) => {
      throw new ServiceUnavailableException(mensagemBanco(error));
    });
  }

  @Get('active')
  @ApiOperation({ summary: 'Obtém a configuração do ambiente que está ativo no momento' })
  @ApiResponse({ status: 200, description: 'Configuração ativa retornada com sucesso.' })
  getActiveConfig() {
    return this.configService.getActiveConfig().then((config) => ocultarSegredos(config)).catch((error) => {
      throw new ServiceUnavailableException(mensagemBanco(error));
    });
  }

  @Put(':ambiente')
  @ApiOperation({ summary: 'Atualiza as configurações de um ambiente específico (PRODUCAO ou HOMOLOGACAO)' })
  @ApiResponse({ status: 200, description: 'Configuração atualizada com sucesso.' })
  async updateConfig(
    @Param('ambiente') ambiente: string,
    @Body() updateConfigDto: UpdateConfigDto,
  ) {
    const updated = await this.configService.updateConfig(ambiente, updateConfigDto);
    await this.sessions.invalidateEnvironment(updated.ambiente);
    return ocultarSegredos(updated);
  }

  @Patch('active/:ambiente')
  @ApiOperation({ summary: 'Altera qual ambiente está ativo no sistema' })
  @ApiResponse({ status: 200, description: 'Ambiente ativo alterado com sucesso.' })
  async setActiveEnvironment(@Param('ambiente') ambiente: string) {
    const updated = await this.configService.setActiveEnvironment(ambiente);
    await this.sessions.invalidateEnvironment(updated.ambiente);
    return ocultarSegredos(updated);
  }
}

function mensagemBanco(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  const semSegredo = texto.replace(/password=[^;]*/gi, 'password=***');
  return `Não foi possível ler system_config em sqlteste / db_acompanhamento_glpi. ${semSegredo}`;
}

function ocultarSegredos(config: any): any {
  if (Array.isArray(config)) return config.map(ocultarSegredos);
  if (!config) return config;
  const { glpiAppToken, glpiUserToken, gitnessAccessToken, ...safe } = config;
  return {
    ...safe,
    hasGlpiAppToken: Boolean(glpiAppToken),
    hasGlpiUserToken: Boolean(glpiUserToken),
    hasGitnessAccessToken: Boolean(gitnessAccessToken),
  };
}
