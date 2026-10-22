import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateMeDto } from './dto/update-me.dto';

const AVATAR_DATA_URL_PATTERN =
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
      },
    });

    return this.buildAuthResponse(user.id, user.email, user.name);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    // Contas criadas via OAuth não têm senha — caem no mesmo 401 genérico.
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.buildAuthResponse(
      user.id,
      user.email,
      user.name,
      user.avatarUrl,
    );
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        eventReminderMinutes: true,
        createdAt: true,
        members: {
          select: {
            role: true,
            organization: { select: { id: true, name: true, slug: true, plan: true } },
          },
        },
      },
    });
    return user;
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const data: {
      name?: string;
      avatarUrl?: string | null;
      eventReminderMinutes?: number | null;
    } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.eventReminderMinutes !== undefined) {
      const m = dto.eventReminderMinutes;
      if (m !== null && (typeof m !== 'number' || m < 0 || m > 10080)) {
        throw new BadRequestException(
          'eventReminderMinutes deve estar entre 0 e 10080 (7 dias) ou null para o padrão',
        );
      }
      data.eventReminderMinutes = m;
    }
    if (dto.avatarUrl !== undefined) {
      const url = dto.avatarUrl;
      // null limpa a foto; string precisa ser data URL de imagem ou https
      if (
        url !== null &&
        !AVATAR_DATA_URL_PATTERN.test(url) &&
        !url.startsWith('https://')
      ) {
        throw new BadRequestException(
          'avatarUrl deve ser data URL de imagem (jpeg/png/webp) ou https',
        );
      }
      data.avatarUrl = url;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nada para atualizar');
    }
    return this.me(
      (
        await this.prisma.user.update({
          where: { id: userId },
          data,
          select: { id: true },
        })
      ).id,
    );
  }

  /** Emite o JWT da plataforma para um usuário já autenticado (ex.: OAuth). */
  async loginResponseFor(
    userId: string,
    email: string,
    name: string,
    avatarUrl: string | null,
  ) {
    return this.buildAuthResponse(userId, email, name, avatarUrl);
  }

  private async buildAuthResponse(
    userId: string,
    email: string,
    name: string,
    avatarUrl: string | null = null,
  ) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email });
    return {
      accessToken,
      user: { id: userId, email, name, avatarUrl },
    };
  }
}
