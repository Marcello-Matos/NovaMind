import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';
import { PrismaService } from '../../prisma/prisma.service';

interface SocialIdentity {
  provider: 'google' | 'apple';
  providerUserId: string; // "sub"
  email: string;
  name?: string;
}

/**
 * Login social: valida o identity token emitido pelo provedor no app,
 * encontra/cria o usuário e devolve a identidade para o AuthService
 * assinar o JWT da plataforma.
 */
@Injectable()
export class OauthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async verifyGoogle(idToken: string): Promise<SocialIdentity> {
    const audiences = this.config
      .get<string>('GOOGLE_CLIENT_IDS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!audiences.length) {
      throw new UnauthorizedException(
        'Login Google não configurado (GOOGLE_CLIENT_IDS)',
      );
    }
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new Error('payload incompleto');
      }
      return {
        provider: 'google',
        providerUserId: payload.sub,
        email: payload.email.toLowerCase(),
        name: payload.name ?? undefined,
      };
    } catch {
      throw new UnauthorizedException('Token do Google inválido');
    }
  }

  async verifyApple(
    identityToken: string,
    name?: string,
  ): Promise<SocialIdentity> {
    const clientIds = this.config
      .get<string>('APPLE_CLIENT_IDS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!clientIds.length) {
      throw new UnauthorizedException(
        'Login Apple não configurado (APPLE_CLIENT_IDS)',
      );
    }
    try {
      const payload = await appleSignin.verifyIdToken(identityToken, {
        audience: clientIds.length === 1 ? clientIds[0] : clientIds,
        ignoreExpiration: false,
      });
      if (!payload.sub || !payload.email) {
        throw new Error('payload incompleto');
      }
      return {
        provider: 'apple',
        providerUserId: payload.sub,
        email: payload.email.toLowerCase(),
        name,
      };
    } catch {
      throw new UnauthorizedException('Token da Apple inválido');
    }
  }

  /** Encontra ou cria o usuário a partir da identidade social verificada. */
  async findOrCreateUser(identity: SocialIdentity) {
    const linked = await this.prisma.oauthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: identity.provider,
          providerUserId: identity.providerUserId,
        },
      },
      include: { user: true },
    });
    if (linked) return linked.user;

    const user = await this.prisma.user.upsert({
      where: { email: identity.email },
      update: {},
      create: {
        email: identity.email,
        name: identity.name ?? identity.email.split('@')[0],
        passwordHash: null,
      },
    });

    await this.prisma.oauthAccount.create({
      data: {
        userId: user.id,
        provider: identity.provider,
        providerUserId: identity.providerUserId,
        email: identity.email,
      },
    });
    return user;
  }
}
