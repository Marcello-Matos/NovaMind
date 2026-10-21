# NovaMind

Plataforma de assistentes inteligentes para pessoas e empresas — chat com IA,
memória controlável, tarefas, base de conhecimento e isolamento por
organização. Baseado no plano de produto/arquitetura (`Plano_Projeto_NovaMind.pdf`).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 + React 19 + Tailwind CSS 4 (`apps/web`) |
| Backend | NestJS 10 modular monolith (`apps/api`) |
| Banco | PostgreSQL 16 + pgvector |
| Fila/cache | Redis + BullMQ *(previsto, ainda não conectado)* |
| IA | OpenAI (`gpt-4o-mini` por padrão, intercambiável) |
| Arquivos | S3-compatível (MinIO via compose) *(previsto)* |

## Estrutura

```
apps/
  api/            NestJS — módulos por domínio
    prisma/       schema + migrations (todas as tabelas do plano)
    src/modules/  auth, users, organizations, conversations, ai
                  (orchestrator + tools), memory, tasks, leads,
                  knowledge-base, usage, audit, admin, health
  web/            Next.js App Router — login/registro + área logada
                  (chat, tarefas, memória, documentos, uso)
docker-compose.yml  postgres+pgvector, redis, minio
```

## Como rodar

### 1. Infra (Postgres + pgvector, Redis, MinIO)

```bash
docker compose up -d          # requer Docker
# ou use um Postgres local com a extensão vector instalada
```

### 2. Configurar ambiente

```bash
cp .env.example .env
# edite .env: JWT_SECRET e OPENAI_API_KEY
```

### 3. Banco de dados

```bash
npm run db:migrate --workspace @novamind/api   # aplica migrations
npm run db:generate --workspace @novamind/api  # regera o client
```

### 4. Subir API e Web

```bash
npm run dev:api   # http://localhost:3001/v1  (health: /v1/health)
npm run dev:web   # http://localhost:3000
```

## Endpoints principais (`/v1`)

- `POST /auth/register` · `POST /auth/login` · `GET /auth/me`
- `GET/POST /organizations` · `GET /organizations/:id`
- `GET/POST /conversations` · `GET /conversations/:id` · `POST /conversations/:id/messages`
- `GET/POST/PATCH/DELETE /tasks`, `/memory`, `/leads`
- `GET/POST /knowledge-base/documents` · `DELETE /knowledge-base/documents/:id`
- `GET /usage/summary` · `GET /admin/overview` · `GET /health`

## Ferramentas controladas do orquestrador

`create_task`, `remember_fact`, `search_knowledge_base`, `create_lead`
(somente ambiente empresarial), `create_calendar_event` e `send_message`
(estas duas **sensíveis**: retornam `pendingConfirmation` até o usuário
confirmar — ver `pendingActions` na resposta do chat).

## Notas de segurança (plano, seção 10)

- JWT bearer + `JwtAuthGuard`; isolamento por `organizationId` validado
  em cada consulta empresarial (`assertMembership`).
- Memória é controlável: listar/corrigir/desativar/excluir.
- Ações sensíveis exigem confirmação antes da execução.
- `usage_events` registra tokens e custo estimado por chamada;
  `audit_events` registra execução de ferramentas.
- Sem OPENAI_API_KEY o chat responde `503` explícito — o restante da API
  continua funcional.
