import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { CreateMemoryDto, UpdateMemoryDto } from './dto/memory.dto';

@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.memoryEntry.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  listEnabled(userId: string) {
    return this.prisma.memoryEntry.findMany({
      where: { userId, enabled: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  create(userId: string, dto: CreateMemoryDto, source = 'user') {
    return this.prisma.memoryEntry.create({
      data: { userId, key: dto.key, value: dto.value, source },
    });
  }

  async update(userId: string, id: string, dto: UpdateMemoryDto) {
    await this.findOwned(userId, id);
    return this.prisma.memoryEntry.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.memoryEntry.delete({ where: { id } });
    return { deleted: true };
  }

  private async findOwned(userId: string, id: string) {
    const entry = await this.prisma.memoryEntry.findFirst({
      where: { id, userId },
    });
    if (!entry) throw new NotFoundException('Memória não encontrada');
    return entry;
  }
}

@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.memory.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMemoryDto) {
    return this.memory.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memory.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.memory.remove(user.id, id);
  }
}

@Module({
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
