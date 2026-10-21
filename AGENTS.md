# NovaMind — Notas para agentes

## Comandos

- Instalar deps: `npm install` (raiz; workspaces `apps/*`)
- Typecheck: `npm run typecheck` (raiz) ou por workspace
- Build: `npm run build` (raiz)
- Dev API: `npm run dev:api` (porta 3001, prefixo `/v1`)
- Dev Web: `npm run dev:web` (porta 3000)
- Prisma: rodar a partir de `apps/api` — `npx prisma migrate dev`, `npx prisma generate`
- Infra: `docker compose up -d` (postgres/pgvector, redis, minio)

## Decisões e convenções

- Monorepo npm workspaces; packages nomeados `@novamind/api` e `@novamind/web`.
- Env único na raiz (`.env`); `apps/api/.env` é symlink para `../../.env`
  (necessário para o Prisma CLI). ConfigModule lê `../../.env` antes de `.env`.
- API versionada com prefixo global `/v1`. CORS liberado para `WEB_ORIGIN`
  (default `http://localhost:3000`).
- Auth: JWT bearer (localStorage no front). Guard custom `JwtAuthGuard`
  (sem passport) + decorator `@CurrentUser()`.
- Isolamento multi-tenant: `organizationId` null = ambiente pessoal;
  qualquer consulta empresarial passa por
  `OrganizationsService.assertMembership(userId, orgId, roles?)`.
- Prisma 5 com `postgresqlExtensions` para `vector(1536)` em
  `document_chunks.embedding`. `migrate dev` é interativo — em ambientes
  não-interativos usar `migrate diff` + `db execute` + `migrate resolve`.
- Orquestrador (`apps/api/src/modules/ai/orchestrator.service.ts`):
  monta system prompt por agente + memórias ativas + últimas 30 mensagens,
  roda loop de tool calls (máx. 3 iterações, proteção anti-loop),
  registra `UsageEvent` com custo estimado por modelo (`MODEL_PRICING`
  em `openai.service.ts` — revalidar preços periodicamente).
- Ferramentas em `ai/tools/tool-definitions.ts`; executor em
  `tool-executor.service.ts`. Ferramenta `sensitive: true` retorna
  `pendingConfirmation` — nunca executa sem `confirmed: true` do usuário.
- UI em pt-BR, dark theme, Tailwind v4 (`@tailwindcss/postcss`).
  Estado de auth no front: `src/lib/auth-context.tsx`; HTTP client:
  `src/lib/api.ts`.
- Sem OPENAI_API_KEY: `OpenAiService` lança 503 explícito no chat;
  demais endpoints funcionam.

## Pendências conhecidas (próximas fases do plano)

- Pipeline de documentos: upload S3/MinIO real, extração, chunking,
  embeddings (text-embedding-3-small) e busca vetorial via pgvector.
- BullMQ/Redis: processamento assíncrono, lembretes (`remindAt`), retries.
- Billing: provider de assinatura + webhooks + limites de franquia por plano.
- Confirmação de ações sensíveis: endpoint para confirmar e reexecutar
  `pendingActions` (`confirmedToolCalls` já existe no orquestrador).
- Admin: papéis de plataforma separados dos papéis de organização.
- Refresh tokens / cookies httpOnly, rate limiting, testes automatizados.
