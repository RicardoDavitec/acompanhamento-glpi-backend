import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ConfigService as IntegrationConfigService } from '../config/config.service';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SessionService } from './session.service';
import { SessionUser } from './session.types';
import { AuditService } from '../audit.service';
import { LdapService } from './ldap.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private readonly http: HttpService,
    private readonly integrationConfig: IntegrationConfigService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly ldap: LdapService,
  ) {}

  async login(dto: LoginDto) {
    // A senha é validada primeiro no Active Directory. Ela não é armazenada
    // pelo sistema e só é reutilizada nesta requisição para abrir a sessão do
    // próprio usuário no GLPI (quando o GLPI está integrado ao mesmo AD).
    const adUser = await this.ldap.authenticate(dto.username, dto.password);
    const config = await this.integrationConfig.getActiveConfig();
    const configuredUrl = config?.glpiUrl?.trim() || process.env.GLPI_URL;
    const configuredAppToken = config?.glpiAppToken?.trim() || process.env.GLPI_APP_TOKEN;
    if (!configuredUrl || !configuredAppToken) {
      throw new BadRequestException('A integração GLPI ainda não foi configurada pela TI.');
    }
    const glpiUrl = configuredUrl.replace(/\/+$/, '');
    let sessionToken: string;
    let fullSession: any;
    try {
      const login: any = await firstValueFrom(this.http.get(`${glpiUrl}/initSession`, {
        headers: {
          'Content-Type': 'application/json',
          'App-Token': configuredAppToken,
          Authorization: `Basic ${Buffer.from(`${adUser.username}:${dto.password}`).toString('base64')}`,
        },
      }));
      sessionToken = login.data?.session_token;
      if (!sessionToken) throw new Error('O GLPI não retornou uma sessão válida.');
      const details: any = await firstValueFrom(this.http.get(`${glpiUrl}/getFullSession`, {
        headers: { 'Content-Type': 'application/json', 'App-Token': configuredAppToken, 'Session-Token': sessionToken },
      }));
      fullSession = details.data?.session || details.data || {};
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Credenciais inválidas ou GLPI indisponível.';
      throw new UnauthorizedException(`Sua conta foi validada no AD, mas o GLPI não aceitou a sessão: ${message}`);
    }

    const glpiUserId = Number(fullSession.glpiID || fullSession.glpi_id || fullSession.users_id);
    if (!glpiUserId) throw new UnauthorizedException('O GLPI não devolveu a identificação do usuário.');
    const username = adUser.username;
    const nome = adUser.nome || (fullSession.glpirealname || fullSession.glpifirstname
      ? `${fullSession.glpifirstname || ''} ${fullSession.glpirealname || ''}`.trim()
      : username);
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ glpiUserId }, { username }] } });
    const adminIds = (this.config.get<string>('GLPI_ADMIN_IDS') || '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter(Boolean);
    const role = adminIds.includes(glpiUserId) ? 'ADMIN' : existing?.role || 'TECNICO';
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { username, nome, glpiUserId, role } })
      : await this.prisma.user.create({ data: { username, nome, glpiUserId, role } });

    if (!user.isAtivo) {
      throw new UnauthorizedException('Usuário desativado no sistema.');
    }

    const session = await this.sessions.create(user.id, config?.ambiente || process.env.AMBIENTE || 'HOMOLOGACAO', glpiUrl, sessionToken);
    await this.audit.record({ userId: user.id, ambiente: session.ambiente, action: 'LOGIN_AD', entity: 'SESSION', entityId: session.id, result: 'SUCESSO' });

    return {
      sessionId: session.id,
      csrfToken: session.csrfToken,
      user: {
        id: user.id,
        glpiUserId,
        username: user.username,
        nome: user.nome,
        role: user.role,
      },
    };
  }

  async logout(session: SessionUser) {
    try {
      const config = await this.prisma.systemConfig.findUnique({ where: { ambiente: session.ambiente } });
      const appToken = config?.glpiAppToken?.trim() || process.env.GLPI_APP_TOKEN;
      if (appToken) {
        await firstValueFrom(this.http.get(`${session.glpiUrl}/killSession`, {
          headers: { 'App-Token': appToken, 'Session-Token': session.glpiSessionToken },
        }));
      }
    } catch {
      // A invalidação local continua sendo obrigatória mesmo se o GLPI estiver indisponível.
    }
    await this.sessions.invalidate(session.sessionId);
    await this.audit.record({ userId: session.userId, ambiente: session.ambiente, action: 'LOGOUT', entity: 'SESSION', entityId: session.sessionId, result: 'SUCESSO' });
  }
}
