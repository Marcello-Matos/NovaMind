import {
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { OrganizationsService } from '../organizations/organizations.service';

/**
 * Base de conhecimento — fundação.
 * O upload persiste apenas metadados (status PENDING). O pipeline de
 * extração → chunking → embeddings (pgvector) entra na fase seguinte,
 * junto com o storage S3/MinIO e a fila BullMQ.
 */
@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  async registerDocument(
    userId: string,
    file: { originalname: string; mimetype: string; size: number },
    organizationId?: string,
  ) {
    if (organizationId) {
      await this.organizations.assertMembership(userId, organizationId);
    }
    const fileKey = `docs/${organizationId ?? userId}/${crypto.randomUUID()}-${file.originalname}`;
    return this.prisma.knowledgeDocument.create({
      data: {
        userId,
        organizationId: organizationId ?? null,
        fileKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: 'PENDING',
      },
    });
  }

  async list(userId: string, organizationId?: string) {
    if (organizationId) {
      await this.organizations.assertMembership(userId, organizationId);
      return this.prisma.knowledgeDocument.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.knowledgeDocument.findMany({
      where: { userId, organizationId: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(userId: string, id: string) {
    const doc = await this.prisma.knowledgeDocument.findFirst({
      where: {
        id,
        OR: [
          { userId },
          { organization: { members: { some: { userId } } } },
        ],
      },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    await this.prisma.knowledgeDocument.delete({ where: { id } });
    return { deleted: true };
  }
}

@Controller('knowledge-base')
@UseGuards(JwtAuthGuard)
export class KnowledgeBaseController {
  constructor(private readonly kb: KnowledgeBaseService) {}

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.kb.registerDocument(user.id, file, organizationId);
  }

  @Get('documents')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.kb.list(user.id, organizationId);
  }

  @Delete('documents/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.kb.remove(user.id, id);
  }
}

@Module({
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
