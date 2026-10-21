import { Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditInput {
  actorId?: string | null;
  organizationId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditInput) {
    return this.prisma.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        organizationId: input.organizationId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as object | undefined,
      },
    });
  }
}

@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
