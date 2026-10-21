import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateHabitDto,
  LogHabitDto,
  UpdateHabitDto,
} from './dto/habit.dto';

@Injectable()
export class HabitsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateHabitDto) {
    return this.prisma.habit.create({
      data: {
        ownerId: userId,
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        daysOfWeek: dto.daysOfWeek ?? '0,1,2,3,4,5,6',
      },
    });
  }

  list(userId: string) {
    return this.prisma.habit.findMany({
      where: { ownerId: userId, active: true },
      orderBy: { createdAt: 'asc' },
      include: {
        logs: {
          where: {
            date: { gte: this.daysAgo(60) },
            done: true,
          },
          orderBy: { date: 'desc' },
          select: { date: true },
        },
      },
    });
  }

  async update(userId: string, habitId: string, dto: UpdateHabitDto) {
    await this.findOwned(userId, habitId);
    return this.prisma.habit.update({
      where: { id: habitId },
      data: {
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        daysOfWeek: dto.daysOfWeek,
        active: dto.active,
      },
    });
  }

  async remove(userId: string, habitId: string) {
    await this.findOwned(userId, habitId);
    await this.prisma.habit.delete({ where: { id: habitId } });
    return { deleted: true };
  }

  /** Marca/desmarca o hábito num dia (default hoje). Upsert do log. */
  async log(userId: string, habitId: string, dto: LogHabitDto) {
    await this.findOwned(userId, habitId);
    const day = this.parseDay(dto.date);
    const done = dto.done ?? true;
    const existing = await this.prisma.habitLog.findUnique({
      where: { habitId_date: { habitId, date: day } },
    });
    if (existing && !done) {
      await this.prisma.habitLog.delete({ where: { id: existing.id } });
      return { habitId, date: day, done: false };
    }
    const saved = await this.prisma.habitLog.upsert({
      where: { habitId_date: { habitId, date: day } },
      create: { habitId, date: day, done: true, note: dto.note },
      update: { done: true, note: dto.note },
    });
    return { habitId: saved.habitId, date: saved.date, done: saved.done };
  }

  /** Resumo: sequência atual (streak) e total concluído por hábito. */
  async summary(userId: string) {
    const habits = await this.prisma.habit.findMany({
      where: { ownerId: userId, active: true },
      include: {
        logs: {
          where: { date: { gte: this.daysAgo(180) }, done: true },
          orderBy: { date: 'desc' },
          select: { date: true },
        },
      },
    });
    return habits.map((h) => ({
      id: h.id,
      name: h.name,
      color: h.color,
      daysOfWeek: h.daysOfWeek,
      streak: this.computeStreak(h.logs.map((l) => l.date), h.daysOfWeek),
      totalDone: h.logs.length,
    }));
  }

  private computeStreak(dates: Date[], daysOfWeek: string): number {
    if (!dates.length) return 0;
    const validDays = new Set(daysOfWeek.split(',').map(Number));
    const dayKeys = new Set(
      dates.map((d) => d.toISOString().slice(0, 10)),
    );
    let streak = 0;
    const cursor = new Date();
    // Caminha de hoje para trás; só conta dias em que o hábito vale
    for (let i = 0; i < 180; i++) {
      const key = cursor.toISOString().slice(0, 10);
      if (validDays.has(cursor.getUTCDay())) {
        if (dayKeys.has(key)) {
          streak++;
        } else if (i > 0) {
          break; // hoje ainda pode ser concluído; dias passados quebram
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
  }

  private parseDay(date?: string): Date {
    if (!date) {
      const now = new Date();
      return new Date(
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
      );
    }
    return new Date(`${date}T00:00:00.000Z`);
  }

  private daysAgo(n: number): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private async findOwned(userId: string, habitId: string) {
    const habit = await this.prisma.habit.findFirst({
      where: { id: habitId, ownerId: userId },
    });
    if (!habit) throw new NotFoundException('Hábito não encontrado');
    return habit;
  }
}
