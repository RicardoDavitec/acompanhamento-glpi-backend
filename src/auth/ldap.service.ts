import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ActiveDirectory = require('activedirectory2');

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  constructor(private configService: ConfigService) {}

  async authenticate(username: string, password: string): Promise<{ username: string; nome?: string; email?: string }> {
    const url = this.configService.get<string>('AD_URL') || 'ldap://10.0.0.1'; // IP/Host do Controlador de Domínio
    const baseDN = this.configService.get<string>('AD_BASE_DN') || 'DC=franca,DC=sp,DC=gov,DC=br';
    const domain = this.configService.get<string>('AD_DOMAIN') || 'FRANCA';

    // Formata o usuário para o padrão DOMINIO\usuario caso não enviado
    const userPrincipal = username.includes('\\') || username.includes('@')
      ? username
      : `${domain}\\${username}`;

    const adConfig = {
      url,
      baseDN,
      username: userPrincipal,
      password,
      connectTimeout: 5000,
      timeout: 10000,
    };

    // Limite total: se o AD não responder, devolve erro em vez de deixar o login travado
    const LIMITE_MS = 12000;
    let timer: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        this.logger.error(`AD não respondeu em ${LIMITE_MS / 1000}s (${url}). Verifique AD_URL.`);
        reject(new ServiceUnavailableException('O servidor de rede (AD) não respondeu. Tente novamente em instantes.'));
      }, LIMITE_MS);
    });

    return Promise.race([this.autenticarAd(adConfig, userPrincipal, username, password), limite]).finally(() =>
      clearTimeout(timer),
    );
  }

  private autenticarAd(
    adConfig: Record<string, unknown>,
    userPrincipal: string,
    username: string,
    password: string,
  ): Promise<{ username: string; nome?: string; email?: string }> {
    return new Promise((resolve, reject) => {
      const ad = new ActiveDirectory(adConfig);

      ad.authenticate(userPrincipal, password, (err: any, auth: boolean) => {
        if (err || !auth) {
          this.logger.warn(`Falha na autenticação AD para o usuário ${username}: ${err?.message || 'Credenciais inválidas'}`);
          return reject(new UnauthorizedException('Usuário ou senha de rede inválidos.'));
        }

        // Busca dados básicos do perfil do usuário no AD
        const cleanUsername = username.replace(/.*\\/, '').split('@')[0];
        
        ad.findUser(cleanUsername, (findErr: any, user: any) => {
          if (findErr || !user) {
            return resolve({
              username: cleanUsername,
              nome: cleanUsername,
            });
          }

          return resolve({
            username: cleanUsername,
            nome: user.displayName || user.cn || cleanUsername,
            email: user.mail || null,
          });
        });
      });
    });
  }
}