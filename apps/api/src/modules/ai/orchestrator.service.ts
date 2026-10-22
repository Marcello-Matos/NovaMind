import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentType, MessageRole, TaskStatus } from '@prisma/client';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { PrismaService } from '../../prisma/prisma.service';
import { brazilHolidaysBetween } from '../calendar/brazil-holidays';
import { MemoryService } from '../memory/memory.module';
import { UsageService } from '../usage/usage.module';
import { OpenAiService } from './openai.service';
import { TOOL_DEFINITIONS } from './tools/tool-definitions';
import { ToolExecutorService } from './tools/tool-executor.service';

const MAX_TOOL_ITERATIONS = 3;
const HISTORY_LIMIT = 30;

export interface OrchestratorResult {
  content: string;
  pendingActions: Array<{ tool: string; parameters: Record<string, unknown> }>;
  usage: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
  };
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly tools: ToolExecutorService,
    private readonly memory: MemoryService,
    private readonly usage: UsageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Fluxo de IA (plano, seção 6):
   * entrada → contexto isolado → roteamento de agente/ferramentas →
   * resposta/ação → confirmação de sensíveis → execução → auditoria/uso.
   */
  async run(input: {
    userId: string;
    organizationId: string | null;
    agent: AgentType;
    conversationId: string;
    confirmedToolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  }): Promise<OrchestratorResult> {
    const { userId, organizationId, agent, conversationId } = input;
    const ctx = { userId, organizationId };

    const systemPrompt = await this.buildSystemPrompt(userId, agent, organizationId);
    const history = await this.loadHistory(conversationId);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    // Executa ferramentas sensíveis confirmadas pelo usuário e injeta
    // os resultados no contexto para o modelo narrar o desfecho.
    const confirmedResults: Array<{ tool: string; ok: boolean; result: unknown }> = [];
    for (const call of input.confirmedToolCalls ?? []) {
      const result = await this.tools.execute(
        call.name,
        JSON.stringify(call.arguments),
        ctx,
        true,
      );
      confirmedResults.push({ tool: call.name, ok: result.ok, result: result.result });
    }
    if (confirmedResults.length) {
      messages.push({
        role: 'user',
        content:
          '[Sistema] O usuário confirmou e o backend executou as ações ' +
          'sensíveis abaixo. Informe o desfecho de forma objetiva.\n' +
          JSON.stringify(confirmedResults),
      });
    }

    const tools = Object.entries(TOOL_DEFINITIONS)
      .filter(([, def]) => !def.businessOnly || organizationId)
      .map(([, def]) => def.spec);

    const pendingActions: OrchestratorResult['pendingActions'] = [];
    let promptTokens = 0;
    let completionTokens = 0;
    let content = '';

    for (let i = 0; i <= MAX_TOOL_ITERATIONS; i++) {
      const completion = await this.openai.chat(messages, tools);
      const choice = completion.choices[0];
      promptTokens += completion.usage?.prompt_tokens ?? 0;
      completionTokens += completion.usage?.completion_tokens ?? 0;
      if (!choice) {
        this.logger.warn(`Resposta vazia da OpenAI na conversa ${conversationId}`);
        content = 'Não recebi resposta do modelo. Tente novamente.';
        break;
      }

      const msg = choice.message;
      if (!msg.tool_calls?.length) {
        content = msg.content ?? '';
        break;
      }

      messages.push(msg);
      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const result = await this.tools.execute(
          toolCall.function.name,
          toolCall.function.arguments,
          ctx,
          false,
        );
        if (result.pendingConfirmation) {
          pendingActions.push({
            tool: result.name,
            parameters: (result.result as { parameters: Record<string, unknown> })
              .parameters,
          });
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result.result),
        });
      }

      if (i === MAX_TOOL_ITERATIONS) {
        this.logger.warn(`Tool loop limit reached for conversation ${conversationId}`);
        content =
          'Não consegui concluir a ação com segurança. Tente reformular o pedido.';
      }
    }

    const estimatedCostUsd = this.openai.estimateCostUsd(
      this.openai.chatModel,
      promptTokens,
      completionTokens,
    );
    await this.usage.record({
      userId,
      organizationId,
      eventType: 'CHAT_COMPLETION',
      model: this.openai.chatModel,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      metadata: { conversationId, agent },
    });

    return {
      content,
      pendingActions,
      usage: {
        model: this.openai.chatModel,
        promptTokens,
        completionTokens,
        estimatedCostUsd,
      },
    };
  }

  /**
   * Saudação proativa: reúne o contexto do dia (compromissos, tarefas,
   * hábitos, lembretes, memórias) e o modelo escreve a mensagem de
   * abertura — "Bom dia, Marcello. Hoje você tem reunião às 15h…".
   * Gerada no máximo uma vez por dia por usuário (dedupe na conversa).
   */
  async briefing(userId: string): Promise<OrchestratorResult> {
    // Dia civil em Brasília (UTC-3 fixo — sem horário de verão desde 2019).
    const brNow = new Date(Date.now() - 3 * 3_600_000);
    const y = brNow.getUTCFullYear();
    const m = brNow.getUTCMonth();
    const d = brNow.getUTCDate();
    const dayStart = new Date(Date.UTC(y, m, d, 3)); // 00:00 -03:00
    const dayEnd = new Date(Date.UTC(y, m, d + 1, 3)); // 24:00 -03:00
    const weekday = dayStart.getUTCDay();

    const [user, events, tasks, reminders, habits, memories, holidays] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        }),
        this.prisma.calendarEvent.findMany({
          where: {
            ownerId: userId,
            organizationId: null,
            startsAt: { gte: dayStart, lt: dayEnd },
            allDay: false,
          },
          orderBy: { startsAt: 'asc' },
          take: 8,
          select: { title: true, startsAt: true, endsAt: true },
        }),
        this.prisma.task.findMany({
          where: { ownerId: userId, organizationId: null, status: { not: TaskStatus.DONE } },
          orderBy: [{ priority: 'desc' }, { dueAt: { sort: 'asc', nulls: 'last' } }],
          take: 5,
          select: { title: true, priority: true, dueAt: true },
        }),
        this.prisma.reminder.findMany({
          where: {
            ownerId: userId,
            firedAt: null,
            remindAt: { gte: dayStart, lt: dayEnd },
          },
          orderBy: { remindAt: 'asc' },
          take: 5,
          select: { title: true, remindAt: true },
        }),
        this.prisma.habit.findMany({
          where: {
            ownerId: userId,
            active: true,
            daysOfWeek: { contains: String(weekday) },
          },
          select: {
            name: true,
            logs: {
              where: { date: new Date(Date.UTC(y, m, d)), done: true },
              select: { id: true },
            },
          },
        }),
        this.memory.listEnabled(userId),
        Promise.resolve(
          brazilHolidaysBetween(dayStart, dayEnd).map((h) => h.name),
        ),
      ]);

    const brOf = (dt: Date) => new Date(dt.getTime() - 3 * 3_600_000);
    const fmt = (dt: Date) => {
      const br = brOf(dt);
      return `${String(br.getUTCHours()).padStart(2, '0')}:${String(br.getUTCMinutes()).padStart(2, '0')}`;
    };
    const fmtDate = (dt: Date) => {
      const br = brOf(dt);
      return `${br.getUTCDate()}/${br.getUTCMonth() + 1}`;
    };

    const hora = fmt(new Date());
    const saudacao =
      brNow.getUTCHours() < 12
        ? 'Bom dia'
        : brNow.getUTCHours() < 18
          ? 'Boa tarde'
          : 'Boa noite';

    const contexto = [
      `Agora: ${hora} (${saudacao}), dia ${d}/${m + 1}/${y}.`,
      user?.name ? `Nome do usuário: ${user.name.split(' ')[0]}.` : '',
      holidays.length ? `Feriado hoje: ${holidays.join(', ')}.` : '',
      events.length
        ? `Compromissos de hoje: ${events.map((e) => `${e.title} às ${fmt(e.startsAt)}`).join('; ')}.`
        : 'Nenhum compromisso hoje.',
      reminders.length
        ? `Lembretes de hoje: ${reminders.map((r) => `${r.title} às ${fmt(r.remindAt)}`).join('; ')}.`
        : '',
      tasks.length
        ? `Tarefas pendentes: ${tasks.map((t) => `${t.title}${t.dueAt ? ` (vence ${fmtDate(t.dueAt)})` : ''}`).join('; ')}.`
        : '',
      habits.length
        ? `Hábitos de hoje: ${habits.map((h) => `${h.name}${h.logs.length ? ' (concluído)' : ' (pendente)'}`).join('; ')}.`
        : '',
      memories.length
        ? `Fatos/rotinas na memória: ${memories.map((me) => `${me.key}: ${me.value}`).join('; ')}.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await this.openai.chat([
      {
        role: 'system',
        content:
          'Você é o NovaMind, assistente pessoal proativo em pt-BR. Escreva a ' +
          'mensagem de abertura do dia usando APENAS o contexto fornecido — ' +
          'nunca invente compromissos ou dados. Formato: saudação com o ' +
          'primeiro nome, depois 2-4 linhas curtas e úteis (compromissos com ' +
          'horários, pendências, hábitos não feitos, rotinas da memória como ' +
          '"você costuma almoçar às 13h"), e termine com uma pergunta breve ' +
          'oferecendo ajuda (ex.: "Deseja reorganizar seu dia?"). Tom ' +
          'caloroso e direto, sem emojis e sem markdown. Se o contexto estiver ' +
          'vazio, apenas cumprimente e ofereça ajuda.',
      },
      { role: 'user', content: contexto },
    ]);
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const estimatedCostUsd = this.openai.estimateCostUsd(
      this.openai.chatModel,
      promptTokens,
      completionTokens,
    );
    await this.usage.record({
      userId,
      eventType: 'CHAT_COMPLETION',
      model: this.openai.chatModel,
      promptTokens,
      completionTokens,
      estimatedCostUsd,
      metadata: { briefing: true },
    });
    return {
      content:
        completion.choices[0]?.message.content ??
        'Olá! Como posso ajudar hoje?',
      pendingActions: [],
      usage: {
        model: this.openai.chatModel,
        promptTokens,
        completionTokens,
        estimatedCostUsd,
      },
    };
  }

  private async loadHistory(
    conversationId: string,
  ): Promise<ChatCompletionMessageParam[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        role: { in: [MessageRole.USER, MessageRole.ASSISTANT] },
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return rows.reverse().map((m) => ({
      role: m.role === MessageRole.USER ? 'user' : 'assistant',
      content: m.content,
    }));
  }

  private async buildSystemPrompt(
    userId: string,
    agent: AgentType,
    organizationId: string | null,
  ): Promise<string> {
    const memories = await this.memory.listEnabled(userId);
    const memoryBlock = memories.length
      ? `\n\nFatos autorizados sobre o usuário (memória controlável):\n${memories
          .map((m) => `- ${m.key}: ${m.value}`)
          .join('\n')}`
      : '';

    // Data/hora atual (UTC-3, Brasília) para resolver "hoje", "amanhã", "sexta".
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const weekday = [
      'domingo',
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
    ][now.getUTCDay()];
    const tomorrow = new Date(Date.now() - 3 * 60 * 60 * 1000 + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const dateContext =
      `\n\nData/hora atual: ${weekday}, ${now.toISOString().slice(0, 10)} ` +
      `${now.toISOString().slice(11, 16)} (horário de Brasília, UTC-3). ` +
      'Compromissos com data/hora: create_calendar_event. ' +
      'Lembretes com notificação no aparelho: create_reminder. ' +
      'IMPORTANTE: emita datas/horas sempre com o offset -03:00 — ' +
      `ex.: 9h de amanhã (${tomorrow}) = ${tomorrow}T09:00:00-03:00.`;

    const proactive =
      agent === AgentType.PERSONAL || !organizationId
        ? '\n\nComportamento proativo (essencial):\n' +
          '- Compromissos: proponha via create_calendar_event. Todo compromisso ' +
          'ganha lembrete automático (1h antes, configurável) — NÃO use ' +
          'create_reminder para isso nem ofereça lembrete de compromissos.\n' +
          '- Obrigações com prazo ("pagar a conta até sexta"): crie lembrete ' +
          'no fim da tarde do dia anterior (ex.: quinta às 18h) sem ' +
          'perguntar — apenas informe que criou e para quando.\n' +
          '- "Organize meu dia/de amanhã": use organize_day e apresente o ' +
          'cronograma como lista limpa (hora — item), oferecendo ajustes.\n' +
          '- Clima/tempo ("vai chover?", "previsão pra amanhã", "como está ' +
          'o tempo?"): use get_weather — nunca invente dados meteorológicos. ' +
          'Quando o usuário mencionar onde mora ou a cidade desejada, salve ' +
          'com remember_fact (key "cidade") para as próximas consultas.\n' +
          '- "Que horas são?" / "que dia é hoje?": use get_current_datetime ' +
          'para a resposta exata.\n' +
          '- Destino explícito manda: se o usuário pedir "coloca na memória", ' +
          '"anota", "cria tarefa", "agenda", "me lembra" etc., use EXATAMENTE ' +
          'essa ferramenta — mesmo que o assunto já esteja registrado em outro ' +
          'lugar (ex.: guardar na memória um compromisso que já virou lembrete: ' +
          'remember_fact com chave curta e valor com data, valor e detalhes).\n' +
          '- Mensagens podem vir de ditado por voz: corrija pelo contexto ' +
          'erros típicos de transcrição (números, horários, nomes) e, se a ' +
          'mensagem trouxer vários pedidos, registre CADA um com a ferramenta ' +
          'certa (agenda, lembrete, tarefa, nota, hábito, memória) e liste ' +
          'no fim o que foi feito e onde.\n' +
          '- NUNCA afirme que executou algo sem a ferramenta ter rodado; ' +
          'ações sensíveis (agenda) aguardam o cartão de confirmação.'
        : '';

    if (agent === AgentType.PERSONAL || !organizationId) {
      return (
        'Você é o NovaMind, assistente pessoal em português do Brasil. ' +
        'Objetivo: transformar conversas em tarefas concluídas — organizar a vida ' +
        'pessoal, resumir documentos e criar tarefas/lembretes via ferramentas ' +
        'controladas. Regras: (1) nunca invente ações concluídas; (2) ações ' +
        'sensíveis exigem confirmação do usuário; (3) responda de forma direta e ' +
        'objetiva; (4) não exponha dados de outros usuários ou organizações; ' +
        '(5) o usuário tem uma base de conhecimento com documentos enviados — ' +
        'para perguntas sobre assuntos que possam estar neles, consulte ' +
        'search_knowledge_base antes de responder e cite o arquivo/página.' +
        dateContext +
        proactive +
        memoryBlock
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    return (
      `Você é o NovaMind Empresarial da organização "${org?.name ?? ''}". ` +
      'Responda dúvidas com base nos materiais aprovados (use ' +
      'search_knowledge_base), qualifique leads (create_lead) e apoie ' +
      'agendamentos. Regras: (1) cite a fonte quando usar a base de ' +
      'conhecimento; (2) não invente políticas ou preços; (3) ações sensíveis ' +
      'exigem confirmação; (4) responda em português do Brasil, de forma ' +
      'profissional e concisa.' +
      memoryBlock
    );
  }
}
