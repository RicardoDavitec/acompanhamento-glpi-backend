import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: {
    userId?: number;
    ambiente?: string;
    action: string;
    entity: string;
    entityId?: string | number;
    result: string;
    details?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          ambiente: entry.ambiente,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId === undefined ? undefined : String(entry.entityId),
          result: entry.result,
          details: entry.details ? JSON.stringify(entry.details).slice(0, 1000) : undefined,
        },
      });
    } catch {
      // Auditoria não deve esconder o resultado de uma operação já concluída.
    }
  }
}
