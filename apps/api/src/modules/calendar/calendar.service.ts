import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar.dto';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  async create(
    userId: string,
    dto: CreateCalendarEventDto,
    source: 'APP' | 'AGENT' = 'APP',
  ) {
    if (dto.organizationId) {
      await this.organizations.assertMembership(userId, dto.organizationId);
    }
    return this.prisma.calendarEvent.create({
      data: {
        ownerId: userId,
        organizationId: dto.organizationId ?? null,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        allDay: dto.allDay ?? false,
        source,
      },
    });
  }

  list(userId: string, from: Date, to: Date, organizationId?: string) {
    const where: Prisma.CalendarEventWhereInput = {
      startsAt: { gte: from, lt: to },
      OR: [
        { ownerId: userId },
        { organization: { members: { some: { userId } } } },
      ],
    };
    if (organizationId) where.organizationId = organizationId;
    return this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startsAt: 'asc' },
    });
  }

  async update(userId: string, eventId: string, dto: UpdateCalendarEventDto) {
    await this.findOwned(userId, eventId);
    return this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        allDay: dto.allDay,
      },
    });
  }

  async remove(userId: string, eventId: string) {
    await this.findOwned(userId, eventId);
    await this.prisma.calendarEvent.delete({ where: { id: eventId } });
    return { deleted: true };
  }

  private async findOwned(userId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        id: eventId,
        OR: [
          { ownerId: userId },
          { organization: { members: { some: { userId } } } },
        ],
      },
    });
    if (!event) throw new NotFoundException('Compromisso não encontrado');
    return event;
  }
}
