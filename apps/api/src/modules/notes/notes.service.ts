import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  async create(
    userId: string,
    dto: CreateNoteDto,
    source: 'APP' | 'AGENT' = 'APP',
  ) {
    if (dto.organizationId) {
      await this.organizations.assertMembership(userId, dto.organizationId);
    }
    return this.prisma.note.create({
      data: {
        ownerId: userId,
        organizationId: dto.organizationId ?? null,
        title: dto.title,
        content: dto.content,
        tags: dto.tags ?? [],
        pinned: dto.pinned ?? false,
      },
    });
  }

  list(userId: string, organizationId?: string, search?: string) {
    const where: Prisma.NoteWhereInput = organizationId
      ? { organizationId, organization: { members: { some: { userId } } } }
      : { ownerId: userId, organizationId: null };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.note.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async update(userId: string, noteId: string, dto: UpdateNoteDto) {
    await this.findOwned(userId, noteId);
    return this.prisma.note.update({
      where: { id: noteId },
      data: {
        title: dto.title,
        content: dto.content,
        tags: dto.tags,
        pinned: dto.pinned,
      },
    });
  }

  async remove(userId: string, noteId: string) {
    await this.findOwned(userId, noteId);
    await this.prisma.note.delete({ where: { id: noteId } });
    return { deleted: true };
  }

  private async findOwned(userId: string, noteId: string) {
    const note = await this.prisma.note.findFirst({
      where: {
        id: noteId,
        OR: [
          { ownerId: userId },
          { organization: { members: { some: { userId } } } },
        ],
      },
    });
    if (!note) throw new NotFoundException('Anotação não encontrada');
    return note;
  }
}
