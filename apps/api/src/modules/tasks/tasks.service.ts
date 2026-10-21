import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  async create(userId: string, dto: CreateTaskDto) {
    if (dto.organizationId) {
      await this.organizations.assertMembership(userId, dto.organizationId);
    }
    return this.prisma.task.create({
      data: {
        ownerId: userId,
        organizationId: dto.organizationId ?? null,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        remindAt: dto.remindAt ? new Date(dto.remindAt) : undefined,
      },
    });
  }

  list(userId: string, organizationId?: string, status?: TaskStatus) {
    const where: Prisma.TaskWhereInput = organizationId
      ? { organizationId, organization: { members: { some: { userId } } } }
      : { ownerId: userId, organizationId: null };
    if (status) where.status = status;
    return this.prisma.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    await this.findOwned(userId, taskId);
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        remindAt: dto.remindAt ? new Date(dto.remindAt) : undefined,
      },
    });
  }

  async remove(userId: string, taskId: string) {
    await this.findOwned(userId, taskId);
    await this.prisma.task.delete({ where: { id: taskId } });
    return { deleted: true };
  }

  private async findOwned(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        OR: [
          { ownerId: userId },
          { organization: { members: { some: { userId } } } },
        ],
      },
    });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    return task;
  }
}
