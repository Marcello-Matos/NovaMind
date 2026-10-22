import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.module';
import { OpenAiService } from '../openai.service';
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
    private readonly openai: OpenAiService,
  ) {}

  /**
   * Busca híbrida na base de conhecimento do escopo (pessoal ou empresa):
   * semântica via pgvector quando há embeddings; senão, palavras-chave
   * ranqueadas pela quantidade de termos encontrados.
   */
  private async searchKnowledge(ctx: ToolContext, query: string) {
    const scope = ctx.organizationId
      ? Prisma.sql`d.organization_id = ${ctx.organizationId}`
      : Prisma.sql`d.user_id = ${ctx.userId} AND d.organization_id IS NULL`;
    const format = (rows: Array<{ content: string; fileName: string; source: unknown }>) => ({
      matches: rows.map((r) => {
        const page = (r.source as { page?: number } | null)?.page;
        const file = (r.source as { file?: string } | null)?.file ?? r.fileName;
        return {
          source: page ? `${file} (página ${page})` : file,
          excerpt: r.content.slice(0, 1200),
        };
      }),
    });

    if (this.openai.isConfigured && query.trim()) {
      try {
        const { vectors } = await this.openai.embed([query]);
        const vector = `[${vectors[0].join(',')}]`;
        const rows = await this.prisma.$queryRaw<
          Array<{ content: string; fileName: string; source: unknown }>
        >`
          SELECT c.content, d.file_name AS "fileName", c.source
          FROM document_chunks c
          JOIN knowledge_documents d ON d.id = c.document_id
          WHERE c.embedding IS NOT NULL AND d.status = 'READY' AND ${scope}
          ORDER BY c.embedding <=> ${vector}::vector
          LIMIT 6`;
        if (rows.length) return format(rows);
      } catch (err) {
        this.logger.warn(`Busca semântica indisponível, usando palavras-chave: ${err}`);
      }
    }

    const terms = [
      ...new Set(
        query
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((t) => t.length >= 3),
      ),
    ].slice(0, 8);
    if (!terms.length) return { matches: [] };
    const candidates = await this.prisma.documentChunk.findMany({
      where: {
        OR: terms.map((t) => ({ content: { contains: t, mode: 'insensitive' as const } })),
        document: {
          status: 'READY',
          ...(ctx.organizationId
            ? { organizationId: ctx.organizationId }
            : { userId: ctx.userId, organizationId: null }),
        },
      },
      take: 60,
      select: { content: true, source: true, document: { select: { fileName: true } } },
    });
    const ranked = candidates
      .map((c) => ({
        content: c.content,
        source: c.source,
        fileName: c.document.fileName,
        score: terms.filter((t) => c.content.toLowerCase().includes(t)).length,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return format(ranked);
  }

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
        result: {
          status: 'AGUARDANDO_CONFIRMACAO_DO_USUARIO',
          executed: false,
          proposedAction: name,
          parameters: args,
          instruction:
            'NADA foi gravado ainda. Diga que a ação está aguardando a ' +
            'confirmação do usuário no cartão abaixo (ex.: "Preparei o ' +
            'compromisso — confirme no cartão"). Não diga "agendei"/"enviei".',
        },
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

  /**
   * Converte ISO do modelo em instante. O prompt pede offset -03:00, mas
   * quando ele omite, new Date() interpretaria como horário do servidor
   * (UTC no Render) — um "07:00" viraria 4h da manhã no app. Sem offset,
   * assume horário de Brasília, que é o que o usuário quis dizer.
   */
  private parseBrDateTime(value: unknown): Date | undefined {
    if (value == null) return undefined;
    const s = String(value).trim();
    if (!s) return undefined;
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
    const normalized = hasZone
      ? s
      : /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? `${s}T00:00:00-03:00`
        : `${s}-03:00`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? undefined : d;
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
            dueAt: args.dueAt ? this.parseBrDateTime(args.dueAt) : undefined,
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

      case 'search_knowledge_base':
        return this.searchKnowledge(ctx, String(args.query ?? ''));

      case 'create_calendar_event': {
        const startsAt = this.parseBrDateTime(args.startsAt);
        if (!startsAt) {
          return { error: 'startsAt inválido — use ISO 8601 com data e hora' };
        }
        return this.prisma.calendarEvent.create({
          data: {
            ownerId: ctx.userId,
            organizationId: ctx.organizationId,
            title: String(args.title),
            description: args.description ? String(args.description) : undefined,
            location: args.location ? String(args.location) : undefined,
            startsAt,
            endsAt: this.parseBrDateTime(args.endsAt) ?? null,
            source: 'AGENT',
          },
        });
      }

      case 'create_reminder': {
        const remindAt = this.parseBrDateTime(args.remindAt);
        if (!remindAt) {
          return { error: 'remindAt inválido — use ISO 8601 com data e hora' };
        }
        return this.prisma.reminder.create({
          data: {
            ownerId: ctx.userId,
            title: String(args.title),
            remindAt,
            repeatRule: (args.repeatRule as 'NONE' | 'DAILY' | 'WEEKLY') ?? 'NONE',
            source: 'agent',
          },
        });
      }

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

      case 'organize_day':
        return this.organizeDay(ctx, args);

      case 'get_current_datetime': {
        const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const weekday = [
          'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
          'quinta-feira', 'sexta-feira', 'sábado',
        ][now.getUTCDay()];
        const iso = now.toISOString();
        return {
          data: `${weekday}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
          hora: iso.slice(11, 16),
          iso: `${iso.slice(0, 16)}:00-03:00`,
          fuso: 'America/Sao_Paulo (UTC-3)',
        };
      }

      case 'get_weather':
        return this.fetchWeather(ctx, args);

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

  /**
   * Cronograma inteligente: ocupa a jornada com compromissos fixos e
   * preenche os vãos com tarefas pendentes (prioridade > prazo > criação),
   * intercalando pausas e respeitando a duração estimada de cada tarefa.
   */
  private async organizeDay(ctx: ToolContext, args: Record<string, unknown>) {
    const dateStr = String(args.date ?? this.tomorrow());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return { error: 'date deve ser yyyy-mm-dd' };
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayStart = new Date(Date.UTC(y, m - 1, d, 0, 0));
    const dayEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

    const [events, tasks, habits] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: {
          OR: [
            { ownerId: ctx.userId },
            ...(ctx.organizationId
              ? [{ organizationId: ctx.organizationId }]
              : []),
          ],
          startsAt: { gte: dayStart, lte: dayEnd },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.task.findMany({
        where: {
          OR: [
            { ownerId: ctx.userId },
            ...(ctx.organizationId
              ? [{ organizationId: ctx.organizationId }]
              : []),
          ],
          status: { not: 'DONE' },
        },
        orderBy: [
          { priority: 'desc' },
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
        take: 20,
      }),
      this.prisma.habit.findMany({
        where: {
          ownerId: ctx.userId,
          active: true,
          daysOfWeek: { contains: String(dayStart.getUTCDay()) },
        },
      }),
    ]);

    type Block = {
      start: number;
      end: number;
      label: string;
      kind: 'EVENTO' | `TAREFA (${string})` | 'PAUSA';
      ref: string | null;
    };

    // Compromissos fixos (minutos desde a meia-noite)
    const occupied: Block[] = events
      .map((e) => {
        const s = new Date(e.startsAt);
        const end = e.endsAt ?? new Date(s.getTime() + 60 * 60 * 1000);
        return {
          start: s.getUTCHours() * 60 + s.getUTCMinutes(),
          end: Math.max(
            end.getUTCHours() * 60 + end.getUTCMinutes(),
            s.getUTCHours() * 60 + s.getUTCMinutes() + 15,
          ),
          label: e.title,
          kind: 'EVENTO' as const,
          ref: e.id,
        };
      })
      .sort((a, b) => a.start - b.start);

    const parseHm = (hm: unknown, fallback: number) => {
      const mt = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? ''));
      return mt ? Number(mt[1]) * 60 + Number(mt[2]) : fallback;
    };
    const workStart = parseHm(args.workStart, 8 * 60);
    const workEnd = parseHm(args.workEnd, 19 * 60);

    // Duração estimada por prioridade (P1: 60min, P2: 45, P3: 30)
    const durationFor = (p: string) =>
      p === 'P1' ? 60 : p === 'P2' ? 45 : 30;

    const blocks: Block[] = [...occupied];
    const freeTasks = [...tasks];
    const minBlock = 25;

    const scheduleTasks = (from: number, to: number) => {
      let cursor = Math.max(from, workStart);
      const limit = Math.min(to, workEnd);
      while (cursor < limit && freeTasks.length) {
        const task = freeTasks[0];
        const dur = Math.min(durationFor(task.priority), limit - cursor);
        if (dur < minBlock) break;
        freeTasks.shift();
        blocks.push({
          start: cursor,
          end: cursor + dur,
          label: task.title,
          kind: `TAREFA (${task.priority})`,
          ref: task.id,
        });
        cursor += dur;
        // Pausa de 10min entre blocos de trabalho
        if (cursor + 10 < limit) {
          blocks.push({
            start: cursor,
            end: cursor + 10,
            label: 'Pausa',
            kind: 'PAUSA',
            ref: null,
          });
          cursor += 10;
        }
      }
    };

    let prevEnd = workStart;
    for (const occ of occupied) {
      if (occ.start > prevEnd) scheduleTasks(prevEnd, occ.start);
      prevEnd = Math.max(prevEnd, occ.end);
    }
    scheduleTasks(prevEnd, workEnd);

    blocks.sort((a, b) => a.start - b.start);
    const fmt = (min: number) =>
      `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

    return {
      date: dateStr,
      schedule: blocks.map((b) => ({
        inicio: fmt(b.start),
        fim: fmt(b.end),
        tipo: b.kind,
        item: b.label,
      })),
      naoPlanejadas: freeTasks.map((t) => ({
        tarefa: t.title,
        prioridade: t.priority,
        motivo: 'Sem tempo livre na jornada configurada',
      })),
      habitosDoDia: habits.map((h) => h.name),
      observacao:
        'Apresente o cronograma de forma clara e pergunte se quer que os blocos de tarefa virem lembretes.',
    };
  }

  /**
   * Previsão do tempo via Open-Meteo (gratuito, sem chave).
   * Cidade: parâmetro → memória do usuário (key "cidade") → São Paulo.
   */
  private async fetchWeather(ctx: ToolContext, args: Record<string, unknown>) {
    let city = String(args.city ?? '').trim();
    let assumed = false;
    if (!city) {
      const mem = await this.prisma.memoryEntry.findFirst({
        where: {
          userId: ctx.userId,
          OR: [
            { key: { contains: 'cidade', mode: 'insensitive' } },
            { key: { contains: 'local', mode: 'insensitive' } },
          ],
        },
        select: { value: true },
      });
      city = mem?.value.trim() || 'São Paulo';
      assumed = !mem;
    }

    const days = Math.min(7, Math.max(1, Number(args.days) || 3));
    const geoRes = await fetch(
      'https://geocoding-api.open-meteo.com/v1/search?' +
        `name=${encodeURIComponent(city)}&count=1&language=pt&format=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!geoRes.ok) return { error: 'Serviço de clima indisponível no momento' };
    const geo = (await geoRes.json()) as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name: string;
        admin1?: string;
        country?: string;
      }>;
    };
    const place = geo.results?.[0];
    if (!place) {
      return {
        error:
          `Cidade "${city}" não encontrada. Peça ao usuário para repetir ` +
          'o nome da cidade.',
      };
    }

    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,' +
        'weather_code,wind_speed_10m,is_day',
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,' +
        'precipitation_probability_max,sunrise,sunset',
      timezone: 'America/Sao_Paulo',
      forecast_days: String(days),
    });
    const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!wxRes.ok) return { error: 'Serviço de clima indisponível no momento' };
    const wx = (await wxRes.json()) as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        weather_code: number;
        wind_speed_10m: number;
      };
      daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
      };
    };

    return {
      cidade: [place.name, place.admin1 ?? place.country]
        .filter(Boolean)
        .join(', '),
      ...(assumed
        ? {
            aviso:
              'Cidade assumida (São Paulo) — se o usuário estiver em outra, ' +
              'pergunte e salve com remember_fact (key "cidade") para as ' +
              'próximas consultas.',
          }
        : {}),
      agora: {
        temperatura: `${Math.round(wx.current.temperature_2m)}°C`,
        sensacao: `${Math.round(wx.current.apparent_temperature)}°C`,
        umidade: `${wx.current.relative_humidity_2m}%`,
        vento: `${Math.round(wx.current.wind_speed_10m)} km/h`,
        condicao: this.weatherLabel(wx.current.weather_code),
      },
      previsao: wx.daily.time.map((date, i) => ({
        data: date,
        min: `${Math.round(wx.daily.temperature_2m_min[i])}°C`,
        max: `${Math.round(wx.daily.temperature_2m_max[i])}°C`,
        chuva: `${wx.daily.precipitation_probability_max[i] ?? 0}%`,
        condicao: this.weatherLabel(wx.daily.weather_code[i]),
      })),
      fonte: 'Open-Meteo',
    };
  }

  /** Códigos WMO do Open-Meteo → descrição em pt-BR. */
  private weatherLabel(code: number): string {
    const labels: Record<number, string> = {
      0: 'céu limpo', 1: 'predominantemente limpo', 2: 'parcialmente nublado',
      3: 'nublado', 45: 'névoa', 48: 'névoa com geada',
      51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte',
      56: 'garoa congelante', 57: 'garoa congelante forte',
      61: 'chuva fraca', 63: 'chuva moderada', 65: 'chuva forte',
      66: 'chuva congelante', 67: 'chuva congelante forte',
      71: 'neve fraca', 73: 'neve moderada', 75: 'neve forte',
      77: 'grãos de neve',
      80: 'pancadas de chuva fracas', 81: 'pancadas de chuva',
      82: 'pancadas de chuva fortes', 85: 'neve em pancadas',
      86: 'neve forte em pancadas',
      95: 'trovoada', 96: 'trovoada com granizo', 99: 'trovoada com granizo forte',
    };
    return labels[code] ?? `condição ${code}`;
  }

  private tomorrow(): string {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  }
}
