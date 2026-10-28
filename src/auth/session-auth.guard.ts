import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from './session.service';

function cookieValue(header: string | undefined, name: string) {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const sessionId = cookieValue(request.headers.cookie, 'acompanhamento_session');
    const user = await this.sessions.get(sessionId);
    const changing = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (changing && request.headers['x-csrf-token'] !== user.csrfToken) {
      throw new UnauthorizedException('Token de segurança inválido. Atualize a página e tente novamente.');
    }
    request.user = user;
    return true;
  }
}
