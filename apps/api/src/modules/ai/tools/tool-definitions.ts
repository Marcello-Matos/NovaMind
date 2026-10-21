import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Ferramentas controladas (plano, seção 6). O modelo solicita; o backend
 * valida identidade, permissões e parâmetros antes de executar.
 *
 * `sensitive: true` → exige confirmação humana antes da execução real.
 */
export interface ToolDefinition {
  spec: ChatCompletionTool;
  sensitive: boolean;
  /** disponível apenas no ambiente empresarial */
  businessOnly?: boolean;
}

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  create_task: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'create_task',
        description:
          'Cria uma tarefa no ambiente autorizado (pessoal do usuário ou organização da conversa).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título curto da tarefa' },
            description: { type: 'string' },
            dueAt: {
              type: 'string',
              description: 'Data/hora de vencimento em ISO 8601, se houver',
            },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          },
          required: ['title'],
        },
      },
    },
  },
  remember_fact: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'remember_fact',
        description:
          'Guarda uma preferência ou fato autorizado sobre o usuário na memória controlável.',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Nome curto do fato (ex.: "fuso_horario")' },
            value: { type: 'string', description: 'Conteúdo a memorizar' },
          },
          required: ['key', 'value'],
        },
      },
    },
  },
  search_knowledge_base: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'search_knowledge_base',
        description:
          'Consulta documentos acessíveis do escopo atual (pessoal ou organização).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Consulta em linguagem natural' },
          },
          required: ['query'],
        },
      },
    },
  },
  create_lead: {
    sensitive: false,
    businessOnly: true,
    spec: {
      type: 'function',
      function: {
        name: 'create_lead',
        description: 'Registra um lead no CRM da organização correta.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            source: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['name'],
        },
      },
    },
  },
  create_calendar_event: {
    sensitive: true,
    spec: {
      type: 'function',
      function: {
        name: 'create_calendar_event',
        description:
          'Propõe um compromisso na agenda. Sensível: exige confirmação do usuário antes de gravar.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            startsAt: { type: 'string', description: 'ISO 8601' },
            endsAt: { type: 'string', description: 'ISO 8601' },
            location: { type: 'string' },
          },
          required: ['title', 'startsAt'],
        },
      },
    },
  },
  send_message: {
    sensitive: true,
    spec: {
      type: 'function',
      function: {
        name: 'send_message',
        description:
          'Envia mensagem por um canal integrado. Sensível: exige confirmação do usuário.',
        parameters: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'ex.: whatsapp, email' },
            recipient: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['channel', 'recipient', 'body'],
        },
      },
    },
  },
};
