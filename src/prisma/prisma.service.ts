import 'dotenv/config';
import './mssql-driver-windows';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

/**
 * Destino fixo da tabela system_config e dos demais dados da API.
 * O nome curto sqlteste só resolve no Windows (sufixo franca.intranet).
 * No container é preciso o FQDN; o compose também fixa o IP em extra_hosts.
 */
const SQL_HOST = 'sqlteste.franca.intranet';
const SQL_PORT = 1433;
const SQL_DATABASE = 'db_acompanhamento_glpi';

type MssqlConfig = Exclude<ConstructorParameters<typeof PrismaMssql>[0], string>;

/**
 * Monta a configuração do driver a partir do DATABASE_URL.
 *
 * - Login SQL (user/password): a própria string é repassada ao adapter.
 * - Autenticação Windows (integratedSecurity=true): o adapter do Prisma não
 *   entende esse parâmetro na string, então convertemos para um objeto com
 *   autenticação NTLM (usuário e senha do domínio). Funciona dentro do
 *   container Linux. O mesmo DATABASE_URL serve para o `prisma db push`.
 *
 * Formato:
 *   sqlserver://SERVIDOR:1433;database=BANCO;integratedSecurity=true;
 *   username=DOMINIO\usuario;password=SENHA;encrypt=true;trustServerCertificate=true
 *
 * Valores com ; = { } devem ir entre chaves: password={minha;senha}
 */
export function montarConfigMssql(url: string): string | MssqlConfig {
  const semPrefixo = url.replace(/^sqlserver:\/\//i, '');
  const partes = dividirParametros(semPrefixo);
  const hostPart = partes.shift() ?? '';

  const params: Record<string, string> = {};
  for (const parte of partes) {
    const i = parte.indexOf('=');
    if (i <= 0) continue;
    params[parte.slice(0, i).trim().toLowerCase()] = desescapar(parte.slice(i + 1).trim());
  }

  const integrated = ['true', 'yes'].includes((params['integratedsecurity'] ?? '').toLowerCase());
  if (!integrated) return url;

  const [server, portStr] = hostPart.split(':');
  const loginCompleto = params['username'] ?? params['user'] ?? params['uid'] ?? params['userid'] ?? '';
  const password = params['password'] ?? params['pwd'] ?? '';

  // Aceita DOMINIO\usuario, usuario@dominio ou usuario + domain=/AD_DOMAIN
  let domain = params['domain'] ?? process.env.AD_DOMAIN ?? '';
  let userName = loginCompleto;
  if (loginCompleto.includes('\\')) {
    const [d, ...resto] = loginCompleto.split('\\');
    domain = d;
    userName = resto.filter(Boolean).join(''); // tolera FRANCA\\usuario
  } else if (loginCompleto.includes('@')) {
    const [u, d] = loginCompleto.split('@', 2);
    userName = u;
    domain = d.split('.')[0];
  }

  if (!server || !userName || !password) {
    throw new Error(
      'DATABASE_URL com integratedSecurity=true exige servidor, username (DOMINIO\\usuario) e password.',
    );
  }

  const bool = (v: string | undefined, padrao: boolean) =>
    v === undefined ? padrao : ['true', 'yes'].includes(v.toLowerCase());

  return {
    server: server.trim(),
    port: portStr ? Number(portStr) : 1433,
    database: params['database'] ?? params['initial catalog'],
    authentication: {
      type: 'ntlm',
      options: { domain: domain.toUpperCase(), userName, password },
    },
    options: {
      encrypt: bool(params['encrypt'], true),
      trustServerCertificate: bool(params['trustservercertificate'], false),
    },
  } as MssqlConfig;
}

/** Divide por ';' respeitando valores entre chaves { }. */
function dividirParametros(s: string): string[] {
  const out: string[] = [];
  let atual = '';
  let nivel = 0;
  for (const ch of s) {
    if (ch === '{') nivel++;
    if (ch === '}') nivel = Math.max(0, nivel - 1);
    if (ch === ';' && nivel === 0) {
      out.push(atual);
      atual = '';
    } else {
      atual += ch;
    }
  }
  if (atual) out.push(atual);
  return out;
}

function desescapar(v: string): string {
  return v.startsWith('{') && v.endsWith('}') ? v.slice(1, -1).replace(/}}/g, '}') : v;
}

/** Usuário Windows deste computador, sem senha no .env. */
function conexaoUsuarioWindows(): MssqlConfig {
  return {
    server: SQL_HOST,
    port: SQL_PORT,
    database: SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      trustedConnection: true,
    },
  } as MssqlConfig;
}

/**
 * No Linux (container) não há usuário Windows da sessão. Mantém o login que
 * vier no DATABASE_URL, mas o servidor e o banco são sempre
 * sqlteste.franca.intranet / db_acompanhamento_glpi.
 */
function conexaoComCredencialDoEnv(url: string): string | MssqlConfig {
  const config = montarConfigMssql(url);
  if (typeof config !== 'string') {
    return { ...config, server: SQL_HOST, port: SQL_PORT, database: SQL_DATABASE };
  }

  const semPrefixo = config.replace(/^sqlserver:\/\//i, '');
  const partes = dividirParametros(semPrefixo);
  const params = partes.slice(1).filter((parte) => {
    const chave = parte.split('=')[0]?.trim().toLowerCase();
    return chave !== 'database' && chave !== 'initial catalog';
  });
  const resto = params.filter(Boolean).join(';');
  return `sqlserver://${SQL_HOST}:${SQL_PORT};database=${SQL_DATABASE}${resto ? `;${resto}` : ''}`;
}

function montarConexao(): string | MssqlConfig {
  if (process.platform === 'win32') return conexaoUsuarioWindows();

  const url = process.env.DATABASE_URL?.trim();
  if (!url) return conexaoUsuarioWindows();
  return conexaoComCredencialDoEnv(url);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    let config: string | MssqlConfig;
    try {
      config = montarConexao();
    } catch (error: any) {
      new Logger(PrismaService.name).error(error?.message ?? String(error));
      config = conexaoUsuarioWindows();
    }
    const adapter = new PrismaMssql(config);
    super({ adapter });
    this.logger.log(`Banco fixo: ${SQL_HOST} / ${SQL_DATABASE} (tabela system_config).`);
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log(`Conectado em ${SQL_HOST} / ${SQL_DATABASE}.`);
    } catch (error: any) {
      if (process.env.DB_REQUIRED === 'true') throw error;
      this.logger.error(
        `Banco de dados indisponível (${error?.message ?? error}). ` +
          'A API vai subir em MODO SEM BANCO: login e consultas ao GLPI funcionam; ' +
          'tarefas, agendamentos e configurações salvas no banco não.',
      );
    }
  }
}
