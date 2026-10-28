import { Controller, Post, Get, Body, UseGuards, Request, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionService } from './session.service';
import { LoginRateLimitService } from './login-rate-limit.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
    private readonly loginRateLimit: LoginRateLimitService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Realiza login com as credenciais do Active Directory' })
  async login(@Body() dto: LoginDto, @Request() request: any, @Res({ passthrough: true }) response: Response) {
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    this.loginRateLimit.check(ip);
    let result;
    try {
      result = await this.authService.login(dto);
      this.loginRateLimit.success(ip);
    } catch (error) {
      this.loginRateLimit.failure(ip);
      throw error;
    }
    const secure = process.env.NODE_ENV === 'production';
    response.cookie('acompanhamento_session', result.sessionId, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 });
    response.cookie('acompanhamento_csrf', result.csrfToken, { httpOnly: false, secure, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 });
    return { user: result.user, csrfToken: result.csrfToken };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Retorna os dados do usuário logado' })
  getProfile(@Request() req: any) {
    const user = req.user;
    return { id: user.userId, glpiUserId: user.glpiUserId, username: user.username, nome: user.nome, role: user.role, ambiente: user.ambiente };
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Encerra a sessão atual' })
  async logout(@Request() req: any, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(req.user);
    response.clearCookie('acompanhamento_session', { path: '/' });
    response.clearCookie('acompanhamento_csrf', { path: '/' });
    return { success: true };
  }
}
