# NovaMind — Notas para agentes

## Comandos

- Instalar deps: `npm install` (raiz; workspace `apps/api`) e
  `flutter pub get` em `apps/app`
- Typecheck/análise: `npm run typecheck` (raiz) — tsc na API + flutter analyze
- Build: `npm run build` — nest build + `flutter build web`
- Testes: `flutter test` em `apps/app` (ou `npm test` na raiz)
- Dev API: `npm run dev:api` (porta 3001, prefixo `/v1`)
- Dev App: `npm run dev:app` (Flutter web-server, porta 3000) ou
  `cd apps/app && flutter run -d ios|android|chrome`
- Prisma: rodar a partir de `apps/api` — `npx prisma migrate dev`, `npx prisma generate`
- Infra: `docker compose up -d` (postgres/pgvector, redis, minio)

## Decisões e convenções

- Monorepo: `apps/api` (NestJS) + `apps/app` (Flutter). O Flutter **não**
  é workspace npm; os scripts da raiz chamam `cd apps/app && flutter ...`.
- Env único na raiz (`.env`); `apps/api/.env` é symlink para `../../.env`
  (necessário para o Prisma CLI). ConfigModule lê `../../.env` antes de `.env`.
- API versionada com prefixo global `/v1`. CORS: `WEB_ORIGIN` em produção;
  em dev aceita qualquer porta `localhost` (Flutter web usa porta dinâmica).
- URL da API no app: `--dart-define=API_URL=...` (default
  `http://localhost:3001`, ver `apps/app/lib/config/env.dart`).
- Auth: JWT bearer. API guarda custom `JwtAuthGuard` + `@CurrentUser()`.
  No app, token e organização ativa persistem em `shared_preferences`
  (`state/auth_controller.dart`, Provider + ChangeNotifier).
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
- App Flutter: pt-BR, Material 3 dark, NavigationRail (web/desktop) e
  NavigationBar (mobile) — mesmas telas do plano: chat, tarefas, memória
  controlável, documentos e uso/plano.
- file_picker 13.x: API nova — `FilePicker.pickFile()` retorna
  `PlatformFile?`; ler bytes com `file.readAsBytes()`.
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
- Refresh tokens, rate limiting, testes automatizados na API.
