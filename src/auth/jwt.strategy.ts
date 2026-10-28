import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'secret',
    });
  }

  async validate(payload: { sub: number; username: string; role: string }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isAtivo) {
        throw new UnauthorizedException('Usuário não encontrado ou inativo.');
      }

      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      return {
        id: payload.sub,
        username: payload.username,
        nome: payload.username,
        email: null,
        role: payload.role,
        isAtivo: true,
        glpiUserToken: null,
        gitnessAccessToken: null,
      };
    }
  }
}
