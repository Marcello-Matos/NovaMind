import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleInit,
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
import { AiModule } from '../ai/ai.module';
import { AuthUser } from '../auth/auth.types';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsageModule } from '../usage/usage.module';
import {
  DocumentProcessorService,
  SUPPORTED_EXTENSIONS,
  extensionOf,
  mimeTypeFor,
} from './document-processor.service';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Base de conhecimento: o upload registra o documento e dispara o
 * pipeline (extração → chunking → embeddings) em segundo plano. O arquivo
 * original não é armazenado — apenas o texto indexado em document_chunks.
 */
@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly processor: DocumentProcessorService,
  ) {}

  /**
   * O processamento roda em memória: se a API reiniciou no meio, ou se o
   * documento é anterior ao pipeline (PENDING sem conteúdo salvo), não há
   * como retomar — marca como falha para o usuário reenviar.
   */
  async onModuleInit() {
    const { count } = await this.prisma.knowledgeDocument.updateMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      data: {
        status: 'FAILED',
        error: 'Processamento interrompido — exclua e envie o arquivo novamente.',
      },
    });
    if (count) this.logger.warn(`${count} documento(s) marcados para reenvio`);
  }

  async registerDocument(
    userId: string,
    file: Express.Multer.File | undefined,
    organizationId?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo no campo "file"');
    }
    if (!SUPPORTED_EXTENSIONS.includes(extensionOf(file.originalname))) {
      throw new BadRequestException(
        'Formato não suportado. Use PDF, DOCX, TXT, MD, CSV, JSON, HTML ou um .zip com esses arquivos.',
      );
    }
    if (organizationId) {
      await this.organizations.assertMembership(userId, organizationId);
    }
    const fileKey = `docs/${organizationId ?? userId}/${crypto.randomUUID()}-${file.originalname}`;
    const doc = await this.prisma.knowledgeDocument.create({
      data: {
        userId,
        organizationId: organizationId ?? null,
        fileKey,
        fileName: file.originalname,
        mimeType: mimeTypeFor(file.originalname, file.mimetype),
        sizeBytes: file.size,
        status: 'PROCESSING',
      },
    });
    // Segundo plano: o app acompanha o status pela listagem.
    void this.processor.process(doc.id, file.buffer);
    return doc;
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
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
  imports: [AiModule, UsageModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, DocumentProcessorService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
