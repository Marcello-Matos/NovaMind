import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

// USD por 1M tokens — referência: https://developers.openai.com/api/docs/pricing
// Revalidar antes do lançamento.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
};

@Injectable()
export class OpenAiService {
  private client: OpenAI | null = null;
  readonly chatModel: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
    this.chatModel = config.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o-mini');
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
    return this.client.chat.completions.create({
      model: this.chatModel,
      messages,
      tools: tools?.length ? tools : undefined,
      temperature: 0.4,
    });
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
