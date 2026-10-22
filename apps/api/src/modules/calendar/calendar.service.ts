import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { RemindersService } from '../reminders/reminders.service';
import { brazilHolidaysBetween } from './brazil-holidays';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/calendar.dto';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly reminders: RemindersService,
  ) {}

  async create(
    userId: string,
    dto: CreateCalendarEventDto,
    source: 'APP' | 'AGENT' = 'APP',
  ) {
    if (dto.organizationId) {
      await this.organizations.assertMembership(userId, dto.organizationId);
    }
    const event = await this.prisma.calendarEvent.create({
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
    await this.reminders.syncEventReminder(userId, event);
    return event;
  }

  /**
   * Compromissos do intervalo + feriados nacionais calculados localmente.
   * Os feriados entram em qualquer modo (pessoal ou empresarial) e não
   * duplicam os já importados da agenda de feriados do Google.
   */
  async list(userId: string, from: Date, to: Date, organizationId?: string) {
    const where: Prisma.CalendarEventWhereInput = {
      startsAt: { gte: from, lt: to },
      OR: [
        { ownerId: userId },
        { organization: { members: { some: { userId } } } },
      ],
    };
    if (organizationId) where.organizationId = organizationId;
    const events = await this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startsAt: 'asc' },
    });

    const importedHolidayDays = new Set(
      events
        .filter((e) => e.isHoliday)
        .map((e) => e.startsAt.toISOString().slice(0, 10)),
    );
    const holidays = brazilHolidaysBetween(from, to)
      .filter((h) => !importedHolidayDays.has(h.date))
      .map((h) => {
        const startsAt = new Date(`${h.date}T00:00:00.000Z`);
        return {
          id: `holiday-${h.date}`,
          ownerId: userId,
          organizationId: null,
          title: h.name,
          description: null,
          location: null,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 86_400_000),
          allDay: true,
          source: 'APP' as const,
          isHoliday: true,
          googleEventId: null,
          googleSyncedAt: null,
          createdAt: startsAt,
          updatedAt: startsAt,
        };
      });

    return [...events, ...holidays].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );
  }

  async update(userId: string, eventId: string, dto: UpdateCalendarEventDto) {
    await this.findOwned(userId, eventId);
    const event = await this.prisma.calendarEvent.update({
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
    await this.reminders.syncEventReminder(userId, event);
    return event;
  }

  async remove(userId: string, eventId: string) {
    const event = await this.findOwned(userId, eventId);
    if (event.isHoliday) {
      throw new BadRequestException('Feriados são somente leitura');
    }
    await this.prisma.calendarEvent.delete({ where: { id: eventId } });
    await this.prisma.reminder.deleteMany({
      where: { ownerId: userId, eventId, source: 'event' },
    });
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
