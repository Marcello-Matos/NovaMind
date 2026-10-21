import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    return this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        members: {
          create: { userId, role: MemberRole.OWNER },
        },
        subscriptions: {
          create: { plan: 'FREE', status: 'ACTIVE' },
        },
      },
      include: { members: true },
    });
  }

  listMine(userId: string) {
    return this.prisma.organization.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { where: { userId }, select: { role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getById(userId: string, organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, members: { some: { userId } } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!org) {
      throw new NotFoundException('Organização não encontrada');
    }
    return org;
  }

  async assertMembership(
    userId: string,
    organizationId: string,
    roles?: MemberRole[],
  ) {
    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Você não é membro desta organização');
    }
    if (roles && !roles.includes(member.role)) {
      throw new ForbiddenException('Permissão insuficiente na organização');
    }
    return member;
  }
}
