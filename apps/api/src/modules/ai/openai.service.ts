import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

// USD por 1M tokens — revalidar antes do lançamento.
// OpenAI: https://developers.openai.com/api/docs/pricing
// Gemini: https://ai.google.dev/pricing
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

/** Dimensão da coluna document_chunks.embedding (vector(1536)). */
export const EMBEDDING_DIMENSIONS = 1536;

/** Erros transitórios do provedor (sobrecarga/instabilidade). */
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private client: OpenAI | null = null;
  readonly chatModel: string;
  readonly embeddingModel: string;
  /** Modelo reserva quando o principal está sobrecarregado (null = sem). */
  readonly fallbackChatModel: string | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    const baseURL = config.get<string>('OPENAI_BASE_URL') || undefined;
    if (apiKey) {
      // Compatível com provedores alternativos que expõem a API da OpenAI:
      // Gemini (https://generativelanguage.googleapis.com/v1beta/openai),
      // Groq, OpenRouter etc. Basta definir OPENAI_BASE_URL + OPENAI_CHAT_MODEL.
      // maxRetries: o SDK repete 429/5xx com backoff exponencial.
      this.client = new OpenAI({ apiKey, baseURL, maxRetries: 3, timeout: 60_000 });
    }
    this.chatModel = config.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o-mini');
    this.embeddingModel = config.get<string>(
      'OPENAI_EMBEDDING_MODEL',
      'text-embedding-3-small',
    );
    // Gemini 2.5 Flash devolve 503 "overloaded" em horários de pico; o
    // Flash-Lite tem capacidade separada. Sobrescreva com
    // OPENAI_FALLBACK_CHAT_MODEL (vazio em outros provedores = sem reserva).
    const isGemini = baseURL?.includes('generativelanguage.googleapis.com');
    const fallback = config.get<string>(
      'OPENAI_FALLBACK_CHAT_MODEL',
      isGemini ? 'gemini-2.5-flash-lite' : '',
    );
    this.fallbackChatModel = fallback && fallback !== this.chatModel ? fallback : null;
  }

  /**
   * Gera embeddings com a dimensão da coluna pgvector. Lança erro se o
   * provedor não estiver configurado ou não suportar o modelo/dimensão —
   * quem chama decide o fallback (busca por palavra-chave).
   */
  async embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY não configurada');
    }
    const res = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const vectors = [...res.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    if (vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
      throw new Error(
        `Modelo ${this.embeddingModel} retornou dimensão diferente de ${EMBEDDING_DIMENSIONS}`,
      );
    }
    return { vectors, tokens: res.usage?.prompt_tokens ?? 0 };
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY não configurada — defina a chave no .env',
      );
    }
    const create = (model: string) =>
      this.client!.chat.completions.create({
        model,
        messages,
        tools: tools?.length ? tools : undefined,
        temperature: 0.4,
      });
    try {
      return await create(this.chatModel);
    } catch (err) {
      const transient =
        err instanceof OpenAI.APIConnectionError ||
        (err instanceof OpenAI.APIError && TRANSIENT_STATUSES.has(err.status ?? 0));
      if (transient && this.fallbackChatModel) {
        this.logger.warn(
          `${this.chatModel} indisponível (${(err as Error).message}); usando ${this.fallbackChatModel}`,
        );
        try {
          return await create(this.fallbackChatModel);
        } catch (fallbackErr) {
          this.logger.warn(`Modelo reserva também falhou: ${fallbackErr}`);
        }
      }
      throw this.mapError(err);
    }
  }

  /** Erros do provedor viravam 500 genérico — mapeia para mensagens úteis. */
  private mapError(err: unknown): unknown {
    if (err instanceof OpenAI.APIConnectionError) {
      return new ServiceUnavailableException(
        'Não foi possível falar com o provedor de IA agora. Tente novamente em instantes.',
      );
    }
    if (!(err instanceof OpenAI.APIError)) return err;
    if (err.status === 401 || err.status === 403) {
      return new ServiceUnavailableException(
        'Chave do provedor de IA inválida ou revogada — atualize OPENAI_API_KEY.',
      );
    }
    if (err.status === 429) {
      return new ServiceUnavailableException(
        'O provedor de IA atingiu o limite de uso. Aguarde um pouco e tente de novo ' +
          '(se persistir, verifique a quota/billing da chave).',
      );
    }
    if (TRANSIENT_STATUSES.has(err.status ?? 0)) {
      return new ServiceUnavailableException(
        'O assistente está sobrecarregado no momento. Tente novamente em alguns segundos.',
      );
    }
    return new BadGatewayException(
      `Falha no provedor de IA (${err.status ?? 'rede'}): ${err.message}`,
    );
  }

  estimateCostUsd(
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o-mini'];
    return (
      (promptTokens / 1_000_000) * pricing.input +
      (completionTokens / 1_000_000) * pricing.output
    );
  }
}
