import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.module';
import { TOOL_DEFINITIONS } from './tool-definitions';

export interface ToolContext {
  userId: string;
  organizationId: string | null;
}

export interface ToolResult {
  name: string;
  ok: boolean;
  /** true quando a ação é sensível e aguarda confirmação humana */
  pendingConfirmation?: boolean;
  result: unknown;
}

/**
 * Executor de ferramentas controladas.
 * Valida escopo (pessoal vs. organização) e parâmetros antes de executar.
 * Ações sensíveis retornam `pendingConfirmation` em vez de executar —
 * o frontend exibe a proposta e só reenvia com `confirmed: true`.
 */
@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    name: string,
    argsJson: string,
    ctx: ToolContext,
    confirmed: boolean,
  ): Promise<ToolResult> {
    const def = TOOL_DEFINITIONS[name];
    if (!def) {
      return { name, ok: false, result: { error: `Ferramenta desconhecida: ${name}` } };
    }
    if (def.businessOnly && !ctx.organizationId) {
      return {
        name,
        ok: false,
        result: { error: 'Ferramenta disponível apenas no ambiente empresarial' },
      };
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson || '{}');
    } catch {
      return { name, ok: false, result: { error: 'Parâmetros inválidos' } };
    }

    if (def.sensitive && !confirmed) {
      return {
        name,
        ok: true,
        pendingConfirmation: true,
        result: { proposedAction: name, parameters: args },
      };
    }

    try {
      const result = await this.dispatch(name, args, ctx);
      await this.audit.record({
        actorId: ctx.userId,
        organizationId: ctx.organizationId,
        action: `tool.${name}`,
        metadata: { args, confirmed },
      });
      return { name, ok: true, result };
    } catch (err) {
      this.logger.warn(`Tool ${name} failed: ${(err as Error).message}`);
      return { name, ok: false, result: { error: 'Falha ao executar a ferramenta' } };
    }
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<unknown> {
    switch (name) {
      case 'create_task':
        return this.prisma.task.create({
          data: {
            ownerId: ctx.userId,
            organizationId: ctx.organizationId,
            title: String(args.title),
            description: args.description ? String(args.description) : undefined,
            priority: (args.priority as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'MEDIUM',
            dueAt: args.dueAt ? new Date(String(args.dueAt)) : undefined,
          },
        });

      case 'remember_fact':
        return this.prisma.memoryEntry.create({
          data: {
            userId: ctx.userId,
            key: String(args.key),
            value: String(args.value),
            source: 'assistant',
          },
        });

      case 'create_lead':
        return this.prisma.lead.create({
          data: {
            organizationId: ctx.organizationId!,
            name: String(args.name),
            email: args.email ? String(args.email) : undefined,
            phone: args.phone ? String(args.phone) : undefined,
            source: args.source ? String(args.source) : undefined,
            notes: args.notes ? String(args.notes) : undefined,
          },
        });

      case 'search_knowledge_base': {
        // Busca textual simples até o pipeline de embeddings entrar em produção.
        const query = String(args.query ?? '');
        const chunks = await this.prisma.documentChunk.findMany({
          where: {
            content: { contains: query, mode: 'insensitive' },
            document: ctx.organizationId
              ? { organizationId: ctx.organizationId }
              : { userId: ctx.userId, organizationId: null },
          },
          take: 5,
          select: {
            content: true,
            document: { select: { fileName: true } },
          },
        });
        return {
          matches: chunks.map((c) => ({
            source: c.document.fileName,
            excerpt: c.content.slice(0, 500),
          })),
        };
      }

      case 'create_calendar_event':
        return this.prisma.calendarEvent.create({
          data: {
            ownerId: ctx.userId,
            organizationId: ctx.organizationId,
            title: String(args.title),
            description: args.description ? String(args.description) : undefined,
            location: args.location ? String(args.location) : undefined,
            startsAt: new Date(String(args.startsAt)),
            endsAt: args.endsAt ? new Date(String(args.endsAt)) : null,
            source: 'AGENT',
          },
        });

      case 'create_reminder':
        return this.prisma.reminder.create({
          data: {
            ownerId: ctx.userId,
            title: String(args.title),
            remindAt: new Date(String(args.remindAt)),
            repeatRule: (args.repeatRule as 'NONE' | 'DAILY' | 'WEEKLY') ?? 'NONE',
            source: 'agent',
          },
        });

      case 'create_note':
        return this.prisma.note.create({
          data: {
            ownerId: ctx.userId,
            organizationId: ctx.organizationId,
            title: String(args.title),
            content: String(args.content),
            tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
          },
        });

      case 'search_notes': {
        const query = String(args.query ?? '');
        const notes = await this.prisma.note.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { content: { contains: query, mode: 'insensitive' } },
            ],
            ...(ctx.organizationId
              ? { organizationId: ctx.organizationId }
              : { ownerId: ctx.userId, organizationId: null }),
          },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: { title: true, content: true, updatedAt: true },
        });
        return {
          matches: notes.map((n) => ({
            title: n.title,
            excerpt: n.content.slice(0, 400),
          })),
        };
      }

      case 'create_habit':
        return this.prisma.habit.create({
          data: {
            ownerId: ctx.userId,
            name: String(args.name),
            daysOfWeek: args.daysOfWeek ? String(args.daysOfWeek) : '0,1,2,3,4,5,6',
          },
        });

      case 'log_habit': {
        const name = String(args.name ?? '').toLowerCase();
        const habit = await this.prisma.habit.findFirst({
          where: {
            ownerId: ctx.userId,
            active: true,
            name: { contains: name, mode: 'insensitive' },
          },
        });
        if (!habit) {
          return { error: `Hábito não encontrado: ${name}` };
        }
        const day = args.date
          ? new Date(`${String(args.date)}T00:00:00.000Z`)
          : new Date(
              Date.UTC(
                new Date().getFullYear(),
                new Date().getMonth(),
                new Date().getDate(),
              ),
            );
        await this.prisma.habitLog.upsert({
          where: { habitId_date: { habitId: habit.id, date: day } },
          create: { habitId: habit.id, date: day, done: true },
          update: { done: true },
        });
        return { habit: habit.name, date: day.toISOString().slice(0, 10), done: true };
      }

      case 'send_message':
        // Integrações externas entram na fase de automações (semanas 7–8).
        return {
          status: 'not_integrated_yet',
          detail:
            'Integração externa ainda não configurada. Ação registrada e auditada.',
          parameters: args,
        };

      default:
        return { error: `Ferramenta não implementada: ${name}` };
    }
  }
}
