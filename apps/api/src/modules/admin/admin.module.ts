import {
  Controller,
  Get,
  Injectable,
  Module,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

/**
 * Admin — fundação. Por ora expõe apenas um resumo operacional.
 * Papéis de administração da plataforma (vs. papéis de organização)
 * serão formalizados na fase de beta.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [users, organizations, conversations, usage] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organization.count(),
      this.prisma.conversation.count(),
      this.prisma.usageEvent.aggregate({
        _sum: { estimatedCostUsd: true, promptTokens: true, completionTokens: true },
      }),
    ]);
    return {
      users,
      organizations,
      conversations,
      usage: {
        estimatedCostUsd: usage._sum.estimatedCostUsd ?? 0,
        promptTokens: usage._sum.promptTokens ?? 0,
        completionTokens: usage._sum.completionTokens ?? 0,
      },
    };
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(@CurrentUser() _user: AuthUser) {
    return this.admin.overview();
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
