import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from './session.types';

@Injectable()
export class SessionService {
  private readonly durationMs = 8 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private key() {
    // JWT_SECRET mantém compatibilidade com o ambiente implantado antes da
    // sessão por cookie. SESSION_ENCRYPTION_KEY continua sendo o valor
    // recomendado e tem precedência quando configurado.
    const secret = this.config.get<string>('SESSION_ENCRYPTION_KEY') || this.config.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('A sessão segura não foi configurada. Defina SESSION_ENCRYPTION_KEY com ao menos 32 caracteres.');
    }
    return createHash('sha256').update(secret).digest();
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decrypt(value: string) {
    const [ivText, tagText, dataText] = value.split('.');
    if (!ivText || !tagText || !dataText) throw new UnauthorizedException('Sessão inválida.');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8');
  }

  async create(userId: number, ambiente: string, glpiUrl: string, glpiSessionToken: string) {
    const csrfToken = randomBytes(32).toString('hex');
    const session = await this.prisma.appSession.create({
      data: {
        userId,
        ambiente,
        glpiUrl,
        encryptedToken: this.encrypt(glpiSessionToken),
        csrfToken,
        expiresAt: new Date(Date.now() + this.durationMs),
      },
    });
    return session;
  }

  async get(sessionId?: string): Promise<SessionUser> {
    if (!sessionId) throw new UnauthorizedException('Faça login para continuar.');
    const session = await this.prisma.appSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session || session.invalidatedAt || session.expiresAt <= new Date() || !session.user.isAtivo || !session.user.glpiUserId) {
      throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
    }
    return {
      sessionId: session.id,
      userId: session.user.id,
      glpiUserId: session.user.glpiUserId,
      username: session.user.username,
      nome: session.user.nome,
      role: session.user.role,
      ambiente: session.ambiente,
      glpiUrl: session.glpiUrl,
      glpiSessionToken: this.decrypt(session.encryptedToken),
      csrfToken: session.csrfToken,
    };
  }

  async invalidate(sessionId?: string) {
    if (!sessionId) return;
    await this.prisma.appSession.updateMany({
      where: { id: sessionId, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });
  }

  async invalidateEnvironment(ambiente: string) {
    await this.prisma.appSession.updateMany({
      where: { ambiente, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });
  }
}
