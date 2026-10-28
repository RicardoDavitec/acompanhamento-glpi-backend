import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionUser } from './session.types';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<{ user: SessionUser }>().user;
    const ids = (this.config.get<string>('GLPI_ADMIN_IDS') || '').split(',').map((value) => Number(value.trim())).filter(Boolean);
    if (user?.role === 'ADMIN' || ids.includes(user?.glpiUserId)) return true;
    throw new ForbiddenException('Apenas administradores podem alterar a integração.');
  }
}
