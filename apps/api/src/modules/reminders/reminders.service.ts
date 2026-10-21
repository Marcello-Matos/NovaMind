import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateReminderDto,
  UpdateReminderDto,
} from './dto/reminder.dto';

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria lembrete. Usado pelo app e pelo agente (source=agent). */
  create(userId: string, dto: CreateReminderDto, source = 'manual') {
    return this.prisma.reminder.create({
      data: {
        ownerId: userId,
        title: dto.title,
        remindAt: new Date(dto.remindAt),
        repeatRule: dto.repeatRule ?? 'NONE',
        source,
        taskId: dto.taskId,
        eventId: dto.eventId,
      },
    });
  }

  /** Próximos lembretes (futuros + os ainda não disparados). */
  upcoming(userId: string, limit = 50) {
    return this.prisma.reminder.findMany({
      where: { ownerId: userId, firedAt: null },
      orderBy: { remindAt: 'asc' },
      take: limit,
    });
  }

  /** Vencidos e ainda não confirmados pelo app — base das notificações locais. */
  due(userId: string) {
    return this.prisma.reminder.findMany({
      where: {
        ownerId: userId,
        firedAt: null,
        remindAt: { lte: new Date() },
      },
      orderBy: { remindAt: 'asc' },
    });
  }

  async update(userId: string, reminderId: string, dto: UpdateReminderDto) {
    await this.findOwned(userId, reminderId);
    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        title: dto.title,
        remindAt: dto.remindAt ? new Date(dto.remindAt) : undefined,
        repeatRule: dto.repeatRule,
      },
    });
  }

  /**
   * Confirmação do app (notificação local agendada/exibida).
   * Com repetição, avança para a próxima ocorrência em vez de encerrar.
   */
  async ack(userId: string, reminderId: string) {
    const reminder = await this.findOwned(userId, reminderId);
    if (reminder.repeatRule === 'NONE') {
      return this.prisma.reminder.update({
        where: { id: reminderId },
        data: { firedAt: new Date() },
      });
    }
    const step = reminder.repeatRule === 'DAILY' ? 1 : 7;
    const next = new Date(reminder.remindAt);
    while (next.getTime() <= Date.now()) {
      next.setUTCDate(next.getUTCDate() + step);
    }
    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: { remindAt: next, firedAt: null },
    });
  }

  async remove(userId: string, reminderId: string) {
    await this.findOwned(userId, reminderId);
    await this.prisma.reminder.delete({ where: { id: reminderId } });
    return { deleted: true };
  }

  private async findOwned(userId: string, reminderId: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id: reminderId, ownerId: userId },
    });
    if (!reminder) throw new NotFoundException('Lembrete não encontrado');
    return reminder;
  }
}
