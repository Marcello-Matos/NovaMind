import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

/**
 * Sincronização bidirecional com o Google Calendar.
 *
 * Fluxo OAuth: o app abre o navegador em /authorize (com JWT do usuário) →
 * consentimento do Google → /callback troca o código por refresh token
 * (guardado cifrado com AES-256-GCM) → sync incremental via syncToken.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly accessTokenCache = new Map<
    string,
    { token: string; exp: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  // ===== OAuth =====

  authorizeUrl(userId: string): string {
    const clientId = this.config.get<string>('GOOGLE_WEB_CLIENT_ID');
    const base = this.config.get<string>('API_BASE_URL', '');
    const redirectUri =
      base
        ? `${base}/v1/integrations/google/callback`
        : 'https://novamind-api-g4bl.onrender.com/v1/integrations/google/callback';
    if (!clientId) {
      throw new BadRequestException(
        'Integração não configurada (GOOGLE_WEB_CLIENT_ID)',
      );
    }
    const state = this.signState(userId);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /** Verifica o JWT passado na query do /authorize. */
  verifyUserToken(token: string): string {
    try {
      const payload = this.jwt.verify<{ sub: string }>(token);
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async handleCallback(code: string, state: string): Promise<string> {
    const userId = this.verifyState(state);
    const clientId = this.config.get<string>('GOOGLE_WEB_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Integração não configurada (GOOGLE_WEB_CLIENT_ID/GOOGLE_CLIENT_SECRET)',
      );
    }
    const redirectUri = `${this.config.get<string>(
      'API_BASE_URL',
      'https://novamind-api-g4bl.onrender.com',
    )}/v1/integrations/google/callback`;

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      this.logger.error(
        `token exchange falhou: ${await tokenRes.text()}`,
      );
      throw new BadRequestException('Falha ao trocar o código do Google');
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google não devolveu refresh token — refaça a conexão (consentimento completo)',
      );
    }

    let email = '';
    try {
      const ui = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (ui.ok) {
        email = ((await ui.json()) as { email?: string }).email ?? '';
      }
    } catch {
      // e-mail é cosmético; segue sem ele
    }

    await this.prisma.googleCalendarAccount.upsert({
      where: { userId },
      create: {
        userId,
        googleEmail: email,
        refreshToken: this.encrypt(tokens.refresh_token),
        scope: tokens.scope ?? SCOPES.join(' '),
      },
      update: {
        googleEmail: email,
        refreshToken: this.encrypt(tokens.refresh_token),
        scope: tokens.scope ?? SCOPES.join(' '),
        syncToken: null, // primeira sync após reconectar: import total
      },
    });
    this.accessTokenCache.delete(userId);

    // Primeira importação (best-effort; erro não quebra o redirect)
    try {
      await this.syncUser(userId);
    } catch (e) {
      this.logger.warn(`primeira sync falhou: ${e}`);
    }

    return `<!doctype html><html lang="pt-br"><meta charset="utf-8">
<title>NovaMind</title>
<body style="font-family:sans-serif;background:#0B0F17;color:#E7E9EE;display:grid;place-items:center;height:100vh;text-align:center">
<div><h1>Agenda conectada ✓</h1>
<p>Sua Google Agenda agora sincroniza com o NovaMind.<br>Você pode fechar esta página e voltar ao app.</p></div>
</body></html>`;
  }

  status(userId: string) {
    return this.prisma.googleCalendarAccount
      .findUnique({ where: { userId } })
      .then((a) =>
        a
          ? {
              connected: true as const,
              googleEmail: a.googleEmail,
              lastSyncAt: a.lastSyncAt,
            }
          : { connected: false as const },
      );
  }

  async disconnect(userId: string) {
    await this.prisma.googleCalendarAccount.deleteMany({ where: { userId } });
    this.accessTokenCache.delete(userId);
    return { disconnected: true };
  }

  // ===== Sync =====

  async syncUser(userId: string) {
    const account = await this.prisma.googleCalendarAccount.findUnique({
      where: { userId },
    });
    if (!account) throw new NotFoundException('Google Calendar não conectado');

    const accessToken = await this.getAccessToken(userId, account.refreshToken);
    let imported = 0;
    let deleted = 0;
    let pushed = 0;
    let nextSyncToken: string | null = null;

    // ----- Google -> app (incremental) -----
    const params = new URLSearchParams({
      maxResults: '2500',
      singleEvents: 'true',
      showDeleted: 'true',
      orderBy: 'updated',
    });
    if (account.syncToken) {
      params.set('syncToken', account.syncToken);
    } else {
      const timeMin = new Date();
      timeMin.setUTCFullYear(timeMin.getUTCFullYear() - 1);
      params.set('timeMin', timeMin.toISOString());
    }
    let url = `${GOOGLE_EVENTS_URL}?${params.toString()}`;
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 410) {
        // syncToken expirado: recomeça com import total
        return this.syncUserFull(userId);
      }
      if (!res.ok) {
        throw new Error(`Google events list falhou: ${await res.text()}`);
      }
      const page = (await res.json()) as {
        items?: GoogleEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };
      for (const ev of page.items ?? []) {
        if (ev.status === 'cancelled') {
          await this.prisma.calendarEvent.deleteMany({
            where: { ownerId: userId, googleEventId: ev.id },
          });
          deleted++;
          continue;
        }
        const existing = await this.prisma.calendarEvent.findUnique({
          where: { ownerId_googleEventId: { ownerId: userId, googleEventId: ev.id } },
        });
        const data = this.mapGoogleEvent(ev);
        if (existing) {
          // Não sobrescreve edições locais mais novas que a do Google
          if (
            existing.source !== 'GOOGLE' ||
            !existing.googleSyncedAt ||
            existing.updatedAt <= (existing.googleSyncedAt ?? new Date(0))
          ) {
            await this.prisma.calendarEvent.update({
              where: { id: existing.id },
              data: { ...data, googleSyncedAt: new Date() },
            });
            imported++;
          }
        } else {
          await this.prisma.calendarEvent.create({
            data: {
              ownerId: userId,
              googleEventId: ev.id,
              source: 'GOOGLE',
              ...data,
              googleSyncedAt: new Date(),
            },
          });
          imported++;
        }
      }
      nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      url = page.nextPageToken
        ? `${GOOGLE_EVENTS_URL}?pageToken=${page.nextPageToken}&maxResults=2500&singleEvents=true&showDeleted=true`
        : '';
    }

    // ----- app -> Google -----
    const localEvents = await this.prisma.calendarEvent.findMany({
      where: {
        ownerId: userId,
        googleEventId: null,
        source: { not: 'GOOGLE' },
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const ev of localEvents) {
      const body: Record<string, unknown> = {
        summary: ev.title,
        description: ev.description ?? undefined,
        location: ev.location ?? undefined,
        start: ev.allDay
          ? { date: ev.startsAt.toISOString().slice(0, 10) }
          : { dateTime: ev.startsAt.toISOString() },
        end: ev.allDay
          ? {
              date: (ev.endsAt ?? new Date(ev.startsAt.getTime() + 86_400_000))
                .toISOString()
                .slice(0, 10),
            }
          : {
              dateTime: (ev.endsAt ?? new Date(ev.startsAt.getTime() + 3_600_000))
                .toISOString(),
            },
      };
      const res = await fetch(GOOGLE_EVENTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.logger.warn(
          `push falhou para ${ev.id}: ${await res.text()}`,
        );
        continue;
      }
      const created = (await res.json()) as { id: string };
      await this.prisma.calendarEvent.update({
        where: { id: ev.id },
        data: { googleEventId: created.id, googleSyncedAt: new Date() },
      });
      pushed++;
    }

    await this.prisma.googleCalendarAccount.update({
      where: { userId },
      data: {
        syncToken: nextSyncToken,
        lastSyncAt: new Date(),
        lastSyncDirection: 'bidirectional',
      },
    });
    return { imported, deleted, pushed };
  }

  private async syncUserFull(userId: string) {
    // Import total (syncToken expirou): limpa o token e refaz em cascata
    await this.prisma.googleCalendarAccount.update({
      where: { userId },
      data: { syncToken: null },
    });
    return this.syncUser(userId);
  }

  private mapGoogleEvent(ev: GoogleEvent) {
    const allDay = !ev.start?.dateTime;
    const startsAt = new Date(
      ev.start?.dateTime ?? `${ev.start?.date ?? '1970-01-01'}T00:00:00Z`,
    );
    const endsAtRaw = ev.end?.dateTime ?? ev.end?.date;
    const endsAt = endsAtRaw
      ? new Date(
          ev.end?.dateTime ?? `${ev.end?.date ?? '1970-01-02'}T00:00:00Z`,
        )
      : null;
    return {
      title: ev.summary ?? '(sem título)',
      description: ev.description ?? null,
      location: ev.location ?? null,
      startsAt,
      endsAt,
      allDay,
    };
  }

  // ===== infra =====

  private async getAccessToken(
    userId: string,
    encryptedRefreshToken: string,
  ): Promise<string> {
    const cached = this.accessTokenCache.get(userId);
    if (cached && cached.exp > Date.now() + 60_000) return cached.token;

    const clientId = this.config.get<string>('GOOGLE_WEB_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new BadRequestException('Integração não configurada no servidor');
    }
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.decrypt(encryptedRefreshToken),
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      throw new Error(`refresh token falhou: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessTokenCache.set(userId, {
      token: data.access_token,
      exp: Date.now() + data.expires_in * 1000,
    });
    return data.access_token;
  }

  /** Cron a cada 15 minutos: sincroniza todas as contas conectadas. */
  @Cron('*/15 * * * *')
  async syncAll() {
    const accounts = await this.prisma.googleCalendarAccount.findMany({
      select: { userId: true },
    });
    for (const a of accounts) {
      try {
        await this.syncUser(a.userId);
      } catch (e) {
        this.logger.warn(`sync falhou para ${a.userId}: ${e}`);
      }
    }
  }

  // ===== state/stateless helpers =====

  private secret(): string {
    return (
      this.config.get<string>('GOOGLE_TOKEN_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'novamind-dev-secret'
    );
  }

  private signState(userId: string): string {
    const exp = Date.now() + 10 * 60_000;
    const payload = `${userId}.${exp}`;
    const sig = crypto
      .createHmac('sha256', this.secret())
      .update(payload)
      .digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${sig}`;
  }

  private verifyState(state: string): string {
    const [b64, sig] = state.split('.');
    if (!b64 || !sig) throw new UnauthorizedException('state inválido');
    const payload = Buffer.from(b64, 'base64url').toString();
    const expected = crypto
      .createHmac('sha256', this.secret())
      .update(payload)
      .digest('base64url');
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('state inválido');
    }
    const [userId, expStr] = payload.split('.');
    if (Number(expStr) < Date.now()) {
      throw new UnauthorizedException('state expirado — tente conectar de novo');
    }
    return userId;
  }

  private key(): Buffer {
    return crypto.createHash('sha256').update(this.secret()).digest();
  }

  private encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  private decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}
