import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentType, MessageRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrchestratorService } from '../ai/orchestrator.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  CreateConversationDto,
  SendMessageDto,
} from './dto/conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async create(userId: string, dto: CreateConversationDto) {
    if (dto.organizationId) {
      await this.organizations.assertMembership(userId, dto.organizationId);
    }
    return this.prisma.conversation.create({
      data: {
        userId,
        organizationId: dto.organizationId ?? null,
        agent:
          dto.agent ??
          (dto.organizationId ? AgentType.BUSINESS_FAQ : AgentType.PERSONAL),
        title: dto.title,
      },
    });
  }

  list(userId: string, organizationId?: string) {
    return this.prisma.conversation.findMany({
      where: organizationId
        ? {
            organizationId,
            organization: { members: { some: { userId } } },
          }
        : { userId, organizationId: null },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true, role: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getWithMessages(userId: string, id: string) {
    const conversation = await this.findAuthorized(userId, id);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    return { ...conversation, messages };
  }

  /**
   * Persiste a mensagem do usuário, roda o orquestrador e persiste a
   * resposta do assistente com consumo e ações pendentes.
   * `confirmedActions` executa ferramentas sensíveis previamente
   * propostas e aprovadas pelo usuário.
   */
  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto) {
    if (!dto.content?.trim() && !dto.confirmedActions?.length) {
      throw new BadRequestException(
        'Envie um conteúdo ou confirme ações pendentes',
      );
    }
    const conversation = await this.findAuthorized(userId, conversationId);

    if (dto.content?.trim()) {
      await this.prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.USER,
          content: dto.content.trim(),
        },
      });
    }

    const result = await this.orchestrator.run({
      userId,
      organizationId: conversation.organizationId,
      agent: conversation.agent,
      conversationId,
      confirmedToolCalls: dto.confirmedActions?.map((a) => ({
        name: a.tool,
        arguments: a.parameters,
      })),
    });

    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: MessageRole.ASSISTANT,
        content: result.content,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        estimatedCostUsd: result.usage.estimatedCostUsd,
        toolCalls: result.pendingActions.length
          ? ({ pendingActions: result.pendingActions } as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    if (!conversation.title && dto.content) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title: dto.content.slice(0, 80) },
      });
    }

    return { message: assistantMessage, pendingActions: result.pendingActions };
  }

  async remove(userId: string, id: string) {
    await this.findAuthorized(userId, id);
    await this.prisma.conversation.delete({ where: { id } });
    return { deleted: true };
  }

  private async findAuthorized(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }
    const isPersonal = !conversation.organizationId;
    if (isPersonal && conversation.userId !== userId) {
      throw new ForbiddenException('Acesso negado à conversa');
    }
    if (conversation.organizationId) {
      await this.organizations.assertMembership(
        userId,
        conversation.organizationId,
      );
    }
    return conversation;
  }
}
