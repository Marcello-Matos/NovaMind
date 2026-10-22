import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
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

  private assertValidFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo no campo "file"');
    }
    if (!SUPPORTED_EXTENSIONS.includes(extensionOf(file.originalname))) {
      throw new BadRequestException(
        'Formato não suportado. Use PDF, DOCX, TXT, MD, CSV, JSON, HTML ou um .zip com esses arquivos.',
      );
    }
  }

  async registerDocument(
    userId: string,
    file: Express.Multer.File | undefined,
    organizationId?: string,
  ) {
    this.assertValidFile(file);
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

  /** Detalhes + texto indexado (paginado) para conferência pelo usuário. */
  async get(userId: string, id: string, offset = 0, limit = 20) {
    const doc = await this.findAccessible(userId, id);
    const [chunkCount, chunks] = await Promise.all([
      this.prisma.documentChunk.count({ where: { documentId: id } }),
      this.prisma.documentChunk.findMany({
        where: { documentId: id },
        orderBy: { chunkIndex: 'asc' },
        skip: Math.max(0, offset),
        take: Math.min(Math.max(1, limit), 50),
        select: { chunkIndex: true, content: true, source: true },
      }),
    ]);
    return { ...doc, chunkCount, chunks };
  }

  /**
   * Renomeia mantendo a extensão original e atualiza a fonte citada pela
   * IA nos trechos (inclusive "arquivo.zip/pasta/x.md" → novo prefixo).
   */
  async rename(userId: string, id: string, rawName: string) {
    const doc = await this.findAccessible(userId, id);
    const ext = extensionOf(doc.fileName);
    let fileName = rawName.trim().replace(/[\\/]/g, '-');
    if (!fileName) throw new BadRequestException('Informe um nome');
    if (ext && extensionOf(fileName) !== ext) fileName = `${fileName}.${ext}`;
    if (fileName === doc.fileName) return doc;

    await this.prisma.$executeRaw`
      UPDATE document_chunks
      SET source = jsonb_set(
        source::jsonb, '{file}',
        to_jsonb(${fileName}::text || substr(source->>'file', ${doc.fileName.length + 1}::int))
      )
      WHERE document_id = ${id}
        AND left(source->>'file', ${doc.fileName.length}::int) = ${doc.fileName}`;
    return this.prisma.knowledgeDocument.update({
      where: { id },
      data: { fileName },
    });
  }

  /** Troca o conteúdo do documento e reindexa (mantém o mesmo registro). */
  async replace(userId: string, id: string, file: Express.Multer.File | undefined) {
    this.assertValidFile(file);
    const current = await this.findAccessible(userId, id);
    if (current.status === 'PROCESSING') {
      throw new BadRequestException(
        'Aguarde o processamento atual terminar antes de substituir o arquivo',
      );
    }
    const doc = await this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        fileName: file.originalname,
        mimeType: mimeTypeFor(file.originalname, file.mimetype),
        sizeBytes: file.size,
        status: 'PROCESSING',
        error: null,
        metadata: undefined,
      },
    });
    void this.processor.process(doc.id, file.buffer);
    return doc;
  }

  async remove(userId: string, id: string) {
    await this.findAccessible(userId, id);
    await this.prisma.knowledgeDocument.delete({ where: { id } });
    return { deleted: true };
  }

  private async findAccessible(userId: string, id: string) {
    const doc = await this.prisma.knowledgeDocument.findFirst({
      where: {
        id,
        OR: [
          { userId, organizationId: null },
          { organization: { members: { some: { userId } } } },
        ],
      },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    return doc;
  }
}

class RenameDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fileName!: string;
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

  @Get('documents/:id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.kb.get(user.id, id, Number(offset) || 0, Number(limit) || 20);
  }

  @Patch('documents/:id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RenameDocumentDto,
  ) {
    return this.kb.rename(user.id, id, dto.fileName);
  }

  @Put('documents/:id/file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.kb.replace(user.id, id, file);
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
