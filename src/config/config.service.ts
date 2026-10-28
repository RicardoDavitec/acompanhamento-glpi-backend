import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConfigDto } from './dto/update-config.dto';

@Injectable()
export class ConfigService {
  constructor(private readonly prisma: PrismaService) { }

  // Garante a existência dos registros e força a exclusividade de apenas UM ambiente ativo
  private async ensureDefaultConfigs() {
    await Promise.all([
      this.prisma.systemConfig.upsert({
        where: { ambiente: 'PRODUCAO' },
        update: {},
        create: { ambiente: 'PRODUCAO', isAtivo: true },
      }),
      this.prisma.systemConfig.upsert({
        where: { ambiente: 'HOMOLOGACAO' },
        update: {},
        create: { ambiente: 'HOMOLOGACAO', isAtivo: false },
      }),
    ]);

    // Trava de segurança: se ambos (ou nenhum) estiverem ativos no banco, corrige automaticamente
    const activeCount = await this.prisma.systemConfig.count({
      where: { isAtivo: true },
    });

    if (activeCount !== 1) {
      await this.prisma.$transaction([
        this.prisma.systemConfig.updateMany({ data: { isAtivo: false } }),
        this.prisma.systemConfig.update({
          where: { ambiente: 'PRODUCAO' },
          data: { isAtivo: true },
        }),
      ]);
    }
  }

  async getAllConfigs() {
    await this.ensureDefaultConfigs();
    return this.prisma.systemConfig.findMany();
  }

  async getActiveConfig() {
    await this.ensureDefaultConfigs();
    const active = await this.prisma.systemConfig.findFirst({ where: { isAtivo: true } });
    return active || (await this.prisma.systemConfig.findFirst({ where: { ambiente: 'PRODUCAO' } }));
  }

  async updateConfig(ambiente: string, dto: UpdateConfigDto) {
    await this.ensureDefaultConfigs();
    const envKey = ambiente.toUpperCase();

    if (!['PRODUCAO', 'HOMOLOGACAO'].includes(envKey)) {
      throw new BadRequestException('Ambiente inválido. Use PRODUCAO ou HOMOLOGACAO.');
    }

    // Garante que o salvamento de credenciais não altere a propriedade isAtivo
    const { isAtivo, ...dataToUpdate } = dto as Record<string, any>;

    for (const key of ['glpiAppToken', 'glpiUserToken', 'gitnessAccessToken']) {
      if (dataToUpdate[key] === '') delete dataToUpdate[key];
    }
    return this.prisma.systemConfig.update({
      where: { ambiente: envKey },
      data: dataToUpdate,
    });
  }

  async setActiveEnvironment(ambiente: string) {
    await this.ensureDefaultConfigs();
    const envKey = ambiente.toUpperCase();

    if (!['PRODUCAO', 'HOMOLOGACAO'].includes(envKey)) {
      throw new BadRequestException('Ambiente inválido. Use PRODUCAO ou HOMOLOGACAO.');
    }

    // Desativa todos os registros e ativa estritamente o ambiente solicitado
    const [, updated] = await this.prisma.$transaction([
      this.prisma.systemConfig.updateMany({
        data: { isAtivo: false },
      }),
      this.prisma.systemConfig.update({
        where: { ambiente: envKey },
        data: { isAtivo: true },
      }),
    ]);

    return updated;
  }
}
