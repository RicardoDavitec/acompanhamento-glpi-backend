import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class LoginRateLimitService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000;

  check(ip: string) {
    const current = this.attempts.get(ip);
    if (current && current.resetAt > Date.now() && current.count >= this.maxAttempts) {
      throw new HttpException('Muitas tentativas de login. Aguarde alguns minutos e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (current && current.resetAt <= Date.now()) this.attempts.delete(ip);
  }

  failure(ip: string) {
    const current = this.attempts.get(ip);
    const valid = current && current.resetAt > Date.now() ? current : { count: 0, resetAt: Date.now() + this.windowMs };
    this.attempts.set(ip, { ...valid, count: valid.count + 1 });
  }

  success(ip: string) {
    this.attempts.delete(ip);
  }
}
