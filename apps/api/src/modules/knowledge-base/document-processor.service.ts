import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { unzipSync } from 'fflate';
import * as mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenAiService } from '../ai/openai.service';
import { UsageService } from '../usage/usage.module';

const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'xml', 'yaml', 'yml', 'log',
];
export const SUPPORTED_EXTENSIONS = [...TEXT_EXTENSIONS, 'pdf', 'docx', 'zip'];

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
};

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH = 64;
const MAX_CHUNKS = 3000;

export const extensionOf = (fileName: string) =>
  /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase() ?? '';

/** iOS/Android enviam application/octet-stream — corrige pela extensão. */
export const mimeTypeFor = (fileName: string, reported: string) =>
  MIME_BY_EXTENSION[extensionOf(fileName)] ?? reported;

interface Section {
  source: string;
  page?: number;
  text: string;
}

interface Chunk {
  source: string;
  page?: number;
  content: string;
}

/** Erro com mensagem segura para exibir ao usuário. */
class DocumentError extends Error {}

/**
 * Pipeline da base de conhecimento:
 * extração de texto → chunking com sobreposição → embeddings (pgvector).
 * Roda em segundo plano após o upload; o status do documento reflete o
 * andamento (PROCESSING → READY | FAILED).
 */
@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiService,
    private readonly usage: UsageService,
  ) {}

  async process(documentId: string, buffer: Buffer): Promise<void> {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) return;
    // updateMany: não lança se o documento for excluído durante o processamento
    await this.prisma.knowledgeDocument.updateMany({
      where: { id: documentId },
      data: { status: 'PROCESSING', error: null },
    });
    try {
      const sections = await this.extract(buffer, doc.fileName, true);
      let chunks = this.chunk(sections);
      if (!chunks.length) {
        throw new DocumentError(
          'Nenhum texto encontrado — o arquivo pode ser imagem ou PDF escaneado.',
        );
      }
      const truncated = chunks.length > MAX_CHUNKS;
      if (truncated) chunks = chunks.slice(0, MAX_CHUNKS);

      const rows = chunks.map((c, i) => ({
        id: randomUUID(),
        documentId,
        chunkIndex: i,
        content: c.content,
        source: { file: c.source, ...(c.page ? { page: c.page } : {}) },
      }));
      await this.prisma.documentChunk.deleteMany({ where: { documentId } });
      await this.prisma.documentChunk.createMany({ data: rows });

      const embedded = await this.embedChunks(
        rows,
        doc.userId,
        doc.organizationId,
        documentId,
      );
      await this.prisma.knowledgeDocument.updateMany({
        where: { id: documentId },
        data: {
          status: 'READY',
          metadata: {
            chunks: rows.length,
            files: new Set(sections.map((s) => s.source)).size,
            characters: sections.reduce((n, s) => n + s.text.length, 0),
            embedded,
            truncated,
          },
        },
      });
      this.logger.log(
        `Documento ${doc.fileName}: ${rows.length} trechos, embeddings=${embedded}`,
      );
    } catch (err) {
      this.logger.warn(`Falha ao processar ${doc.fileName}: ${err}`);
      await this.prisma.knowledgeDocument
        .updateMany({
          where: { id: documentId },
          data: {
            status: 'FAILED',
            error:
              err instanceof DocumentError
                ? err.message
                : 'Não foi possível ler o arquivo. Verifique se ele não está corrompido ou protegido por senha.',
          },
        })
        .catch(() => undefined);
    }
  }

  private async extract(
    buffer: Buffer,
    fileName: string,
    allowZip: boolean,
  ): Promise<Section[]> {
    const ext = extensionOf(fileName);
    if (ext === 'pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: false });
      return text.map((t, i) => ({ source: fileName, page: i + 1, text: t }));
    }
    if (ext === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer });
      return [{ source: fileName, text: value }];
    }
    if (TEXT_EXTENSIONS.includes(ext)) {
      let text = buffer.toString('utf8');
      if (ext === 'html' || ext === 'htm') {
        text = text
          .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
          .replace(/<[^>]+>/g, ' ');
      }
      return [{ source: fileName, text }];
    }
    if (ext === 'zip' && allowZip) {
      const entries = unzipSync(new Uint8Array(buffer));
      const sections: Section[] = [];
      for (const [path, data] of Object.entries(entries)) {
        const base = path.split('/').pop() ?? '';
        if (
          path.endsWith('/') ||
          path.includes('__MACOSX') ||
          base.startsWith('.') ||
          !SUPPORTED_EXTENSIONS.includes(extensionOf(base)) ||
          extensionOf(base) === 'zip'
        ) {
          continue;
        }
        try {
          sections.push(
            ...(await this.extract(Buffer.from(data), `${fileName}/${path}`, false)),
          );
        } catch (err) {
          this.logger.warn(`Arquivo ignorado no zip (${path}): ${err}`);
        }
      }
      if (!sections.length) {
        throw new DocumentError(
          'O .zip não contém arquivos suportados (PDF, DOCX, TXT, MD, CSV, JSON, HTML).',
        );
      }
      return sections;
    }
    throw new DocumentError(`Formato .${ext || '?'} não suportado.`);
  }

  /** Quebra em trechos de ~1500 caracteres, preferindo fim de parágrafo/frase. */
  private chunk(sections: Section[]): Chunk[] {
    const chunks: Chunk[] = [];
    for (const section of sections) {
      const text = section.text
        .replace(/\r/g, '')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      let start = 0;
      while (start < text.length) {
        let end = Math.min(start + CHUNK_SIZE, text.length);
        if (end < text.length) {
          const window = text.slice(start + CHUNK_SIZE / 2, end);
          const breakAt = Math.max(
            window.lastIndexOf('\n\n'),
            window.lastIndexOf('. '),
            window.lastIndexOf('\n'),
          );
          if (breakAt > 0) end = start + CHUNK_SIZE / 2 + breakAt + 1;
        }
        const content = text.slice(start, end).trim();
        if (content.length >= 20) {
          chunks.push({ source: section.source, page: section.page, content });
        }
        if (end >= text.length) break;
        start = Math.max(end - CHUNK_OVERLAP, start + 1);
      }
    }
    return chunks;
  }

  /** Retorna true se todos os trechos ganharam embedding. */
  private async embedChunks(
    rows: Array<{ id: string; content: string }>,
    userId: string | null,
    organizationId: string | null,
    documentId: string,
  ): Promise<boolean> {
    if (!this.openai.isConfigured) return false;
    let tokens = 0;
    try {
      for (let i = 0; i < rows.length; i += EMBED_BATCH) {
        const batch = rows.slice(i, i + EMBED_BATCH);
        const res = await this.openai.embed(batch.map((r) => r.content));
        tokens += res.tokens;
        await this.prisma.$executeRaw`
          UPDATE document_chunks AS c
          SET embedding = v.embedding::vector
          FROM (
            SELECT unnest(${batch.map((r) => r.id)}::text[]) AS id,
                   unnest(${res.vectors.map((v) => `[${v.join(',')}]`)}::text[]) AS embedding
          ) AS v
          WHERE c.id = v.id`;
      }
      return true;
    } catch (err) {
      // Sem embeddings o documento continua pesquisável por palavra-chave.
      this.logger.warn(`Embeddings indisponíveis (${documentId}): ${err}`);
      return false;
    } finally {
      if (tokens > 0 && userId) {
        await this.usage.record({
          userId,
          organizationId,
          eventType: 'EMBEDDING',
          model: this.openai.embeddingModel,
          promptTokens: tokens,
          estimatedCostUsd: this.openai.estimateCostUsd(
            this.openai.embeddingModel,
            tokens,
            0,
          ),
          metadata: { documentId },
        });
      }
    }
  }
}
