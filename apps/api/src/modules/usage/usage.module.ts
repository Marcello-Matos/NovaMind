import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { UsageEventType } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

export interface RecordUsageInput {
  userId: string;
  organizationId?: string | null;
  eventType: UsageEventType;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordUsageInput) {
    return this.prisma.usageEvent.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        eventType: input.eventType,
        model: input.model,
        promptTokens: input.promptTokens ?? 0,
        completionTokens: input.completionTokens ?? 0,
        estimatedCostUsd: input.estimatedCostUsd ?? 0,
        metadata: input.metadata as object | undefined,
      },
    });
  }

  async summary(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [month, total] = await Promise.all([
      this.prisma.usageEvent.aggregate({
        where: { userId, createdAt: { gte: monthStart } },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          estimatedCostUsd: true,
        },
        _count: true,
      }),
      this.prisma.usageEvent.aggregate({
        where: { userId },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          estimatedCostUsd: true,
        },
        _count: true,
      }),
    ]);
    return {
      currentMonth: {
        events: month._count,
        promptTokens: month._sum.promptTokens ?? 0,
        completionTokens: month._sum.completionTokens ?? 0,
        estimatedCostUsd: month._sum.estimatedCostUsd ?? 0,
      },
      allTime: {
        events: total._count,
        promptTokens: total._sum.promptTokens ?? 0,
        completionTokens: total._sum.completionTokens ?? 0,
        estimatedCostUsd: total._sum.estimatedCostUsd ?? 0,
      },
    };
  }
}

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.usage.summary(user.id);
  }
}

@Module({
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
