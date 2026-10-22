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
          'Consulta os documentos enviados pelo usuário (base de conhecimento do escopo ' +
          'atual, pessoal ou organização). Use sempre que a pergunta puder ser ' +
          'respondida por esses materiais e cite o arquivo/página da fonte.',
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
          'Propõe um compromisso na agenda do usuário. Sensível: exige confirmação do usuário antes de gravar.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            startsAt: { type: 'string', description: 'ISO 8601' },
            endsAt: { type: 'string', description: 'ISO 8601' },
            location: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['title', 'startsAt'],
        },
      },
    },
  },
  create_reminder: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'create_reminder',
        description:
          'Cria um lembrete com notificação no aparelho do usuário no horário indicado.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            remindAt: {
              type: 'string',
              description: 'Data/hora do lembrete em ISO 8601',
            },
            repeatRule: {
              type: 'string',
              enum: ['NONE', 'DAILY', 'WEEKLY'],
              description: 'Repetição do lembrete (padrão NONE)',
            },
          },
          required: ['title', 'remindAt'],
        },
      },
    },
  },
  create_note: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'create_note',
        description:
          'Salva uma anotação no escopo atual (pessoal ou da organização da conversa).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título curto da anotação' },
            content: { type: 'string', description: 'Conteúdo da anotação' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Etiquetas opcionais',
            },
          },
          required: ['title', 'content'],
        },
      },
    },
  },
  search_notes: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'search_notes',
        description:
          'Busca anotações do escopo atual (pessoal ou da organização) por palavra-chave.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Palavra-chave da busca' },
          },
          required: ['query'],
        },
      },
    },
  },
  create_habit: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'create_habit',
        description:
          'Cria um hábito para o usuário acompanhar diariamente/semanalmente.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome do hábito (ex.: "Beber 2L de água")' },
            daysOfWeek: {
              type: 'string',
              description:
                'Dias em que vale, 0=domingo, ex.: "1,3,5" (padrão: todos os dias)',
            },
          },
          required: ['name'],
        },
      },
    },
  },
  log_habit: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'log_habit',
        description:
          'Marca um hábito como concluído hoje (ou no dia indicado).',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nome (ou parte) do hábito a marcar',
            },
            date: {
              type: 'string',
              description: 'Dia em yyyy-mm-dd (padrão: hoje)',
            },
          },
          required: ['name'],
        },
      },
    },
  },
  organize_day: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'organize_day',
        description:
          'Monta um cronograma inteligente para um dia, cruzando compromissos, ' +
          'tarefas pendentes, prioridades e tempo livre. Use quando o usuário ' +
          'pedir para organizar o dia/planejar a rotina.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description:
                'Dia a organizar em yyyy-mm-dd (padrão: amanhã)',
            },
            workStart: {
              type: 'string',
              description: 'Início da jornada em HH:mm (padrão 08:00)',
            },
            workEnd: {
              type: 'string',
              description: 'Fim da jornada em HH:mm (padrão 19:00)',
            },
          },
          required: [],
        },
      },
    },
  },
  get_current_datetime: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'get_current_datetime',
        description:
          'Retorna data, hora e dia da semana atuais no fuso do usuário ' +
          '(America/Sao_Paulo). Use para perguntas como "que horas são?", ' +
          '"que dia é hoje?" ou quando precisar do instante exato.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  },
  get_weather: {
    sensitive: false,
    spec: {
      type: 'function',
      function: {
        name: 'get_weather',
        description:
          'Consulta a previsão do tempo real (Open-Meteo): condição atual ' +
          'e previsão diária (máx/mín, chance de chuva) para uma cidade. ' +
          'Se a cidade for omitida, usa a cidade memorizada do usuário; ' +
          'sem memória, assume São Paulo e avisa.',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description:
                'Nome da cidade (ex.: "Porto Alegre"). Omita para usar ' +
                'a cidade do usuário.',
            },
            days: {
              type: 'number',
              description: 'Dias de previsão, 1 a 7 (padrão 3)',
            },
          },
          required: [],
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
