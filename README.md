# NovaMind

> Plataforma de assistentes inteligentes para pessoas e empresas — que transforma
> conversas em tarefas concluídas, com memória controlável, conhecimento
> personalizado e execução segura de ações.

O NovaMind vai além do chatbot comum: é um assistente que **age**. Ele conversa
em português, guarda preferências (com consentimento e controle total do
usuário), cria tarefas e lembretes, consulta documentos da sua base de
conhecimento e registra leads no ambiente empresarial — sempre com permissões
claras e confirmação humana para ações sensíveis.

Projeto construído a partir de um plano de produto de 12 semanas, priorizando
arquitetura correta desde o primeiro commit: monólito modular, isolamento
multi-tenant, ferramentas controladas e transparência de custos de IA.

---

## O que o app faz hoje

### Dois ambientes, uma conta

A mesma conta acessa o ambiente **Pessoal** e ambientes **Empresariais**
(organizações). Cada ambiente tem contexto, ferramentas e permissões próprios.
Dados empresariais são isolados por `organizationId` e validados a cada
consulta — nenhum usuário acessa dado de organização alheia.

### Chat com IA que executa ações reais

O modelo de IA **não tem acesso direto** ao banco ou a credenciais. Ele solicita
ferramentas predefinidas; o backend valida identidade, permissões e parâmetros
antes de executar:

| Ferramenta | O que faz | Escopo |
|---|---|---|
| `create_task` | Cria tarefa no ambiente autorizado | Pessoal e empresa |
| `remember_fact` | Guarda preferência/fato autorizado na memória | Pessoal |
| `search_knowledge_base` | Consulta documentos do escopo atual | Pessoal e empresa |
| `create_lead` | Registra lead no CRM da organização | Somente empresa |
| `create_calendar_event` | Propõe compromisso de agenda | **Sensível — exige confirmação** |
| `send_message` | Envia mensagem por canal integrado | **Sensível — exige confirmação** |

### Confirmação humana para ações sensíveis

Quando o assistente propõe uma ação sensível (compromisso, envio de mensagem),
a execução **não acontece automaticamente**: o usuário vê um card com os
parâmetros exatos e decide — **Confirmar** ou **Recusar**. Toda execução é
auditada (`audit_events`).

### Memória controlável

Diferencial central do produto: a memória do assistente é **do usuário**. Ele
pode listar, corrigir, desativar ou excluir qualquer fato memorizado — um painel
inteiro dedicado a isso, alinhado com privacidade por padrão e LGPD.

### Tarefas, documentos e leads

- **Tarefas**: criadas por chat ("me lembra de ligar pro fornecedor amanhã") ou
  manualmente, com status, prioridade e vencimento.
- **Base de conhecimento**: upload de documentos pessoais ou da organização que
  alimentam as respostas do assistente (pipeline de embeddings na próxima fase).
- **Leads**: CRM simples por organização para qualificação de oportunidades.

### Transparência de uso

Cada chamada de IA registra modelo, tokens e **custo estimado em dólar** — o
painel de uso mostra consumo do mês. Base para as franquias por plano e para a
sustentabilidade do modelo de negócio.

---

## Arquitetura

```
┌─────────────────────┐
│   App Flutter       │  Web, iOS e Android — um único codebase
│   (Dart/Flutter)    │  Material 3, responsivo (NavigationRail/Bar)
└─────────┬───────────┘
          │ HTTPS + JWT
          ▼
┌─────────────────────┐     ┌──────────────────────┐
│   API NestJS        │────▶│  Orquestrador de IA  │
│   monólito modular  │     │  · roteamento agente │
│   /v1               │     │  · ferramentas ctrl. │
└─────────┬───────────┘     │  · confirmação humana│
          │                 │  · proteção anti-loop│
          ▼                 └──────────┬───────────┘
┌─────────────────────┐                │ OpenAI API
│  PostgreSQL 16      │                ▼
│  + pgvector         │     ┌──────────────────────┐
│  · 14 tabelas       │     │  usage_events        │
│  · isolamento org   │     │  audit_events        │
└─────────────────────┘     │  custo por chamada   │
                            └──────────────────────┘
```

### Por que essas escolhas

- **Flutter**: o plano pedia "web responsivo primeiro, com caminho para mobile".
  Flutter Web entrega os dois no mesmo código.
- **Monólito modular NestJS**: a IA não acessa nada diretamente — cada módulo
  (`auth`, `organizations`, `conversations`, `ai`, `memory`, `knowledge-base`,
  `usage`, `audit`) tem fronteira e responsabilidade claras. Separar em
  microserviços só quando houver necessidade real.
- **PostgreSQL + pgvector**: consistência relacional + busca semântica no mesmo
  banco, sem serviço vetorial separado.
- **Ferramentas controladas**: o modelo propõe, o backend decide. É o que torna
  a execução de tarefas segura o suficiente para uso real.

## Stack

| Camada | Tecnologia |
|---|---|
| App | Flutter 3.47 (web + iOS + Android), Provider, Material 3 |
| Backend | NestJS 10, TypeScript (nodenext), class-validator |
| Banco | PostgreSQL 16 + pgvector, Prisma 5 + migrations |
| IA | OpenAI (`gpt-4o-mini`, modelo intercambiável) |
| Infra | Docker Compose (Postgres, Redis, MinIO/S3) |
| Auth | JWT bearer + bcrypt, roles OWNER/ADMIN/MEMBER |

## Estrutura do monorepo

```
apps/
  api/                     NestJS — /v1
    prisma/                schema (14 tabelas) + migrations
    src/modules/
      auth, users, organizations, conversations,
      ai/                  orchestrator + tool-definitions + tool-executor
      memory, tasks, leads, knowledge-base,
      usage, audit, admin, health
  app/                     Flutter — novamind_app
    lib/
      config/              API_URL via --dart-define
      models/              modelos tipados dos recursos
      services/            api_client + novamind_api (camada /v1)
      state/               auth_controller (Provider + shared_preferences)
      ui/screens/          login, registro, chat, tarefas, memória,
                           documentos, uso — layout responsivo
docker-compose.yml         postgres+pgvector, redis, minio
```

## Como rodar

```bash
# 1. Infra
docker compose up -d            # postgres+pgvector, redis, minio

# 2. Ambiente
cp .env.example .env            # defina JWT_SECRET e OPENAI_API_KEY

# 3. Banco
npm run db:migrate --workspace @novamind/api

# 4. API + App
npm run dev:api                 # http://localhost:3001/v1
npm run dev:app                 # Flutter web em http://localhost:3000
                                # ou flutter run -d ios | android
```

Verificação: `npm run typecheck` (tsc + flutter analyze) · `flutter test` ·
`npm run build` (nest build + flutter build web).

## Principais endpoints (`/v1`)

| Recurso | Rotas |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `GET /auth/me` `POST /auth/google` `POST /auth/apple` |
| Organizações | `GET/POST /organizations` `GET /organizations/:id` |
| Conversas | `GET/POST /conversations` `GET /conversations/:id` `POST /conversations/:id/messages` |
| Mensagens | `content` e/ou `confirmedActions: [{tool, parameters}]` |
| Tarefas / Memória / Leads | CRUD completo por escopo |
| Conhecimento | `GET/POST/DELETE /knowledge-base/documents` |
| Uso / Admin | `GET /usage/summary` `GET /admin/overview` `GET /health` |

## Login social e deploy

O app tem botões **Continuar com Google** e **Continuar com Apple**:
o backend valida o identity token de cada provedor (`google-auth-library`
e `apple-signin-auth`), cria/vincula a conta em `oauth_accounts` e emite o
JWT da plataforma. Na web, o Google usa o botão oficial do SDK; a Apple só
aparece quando configurada.

Deploy: blueprint `render.yaml` (API + app web no Render) + banco no Neon.
**Guia completo de configuração: [`docs/DEPLOY.md`](docs/DEPLOY.md)** —
inclui Neon/pgvector, Google Cloud Console e Apple Developer.

## Segurança e privacidade (por padrão)

- Isolamento por `organizationId` validado em **toda** consulta empresarial
- Ações sensíveis nunca executam sem confirmação explícita do usuário
- Memória totalmente controlável pelo usuário (LGPD-friendly)
- Execução de ferramentas auditada; logs sem segredos
- Franquias e limites por plano previstos no modelo de dados
- Sem `OPENAI_API_KEY` o chat responde `503` explícito — nada quebra silenciosamente

## Roadmap (do plano de produto)

- [x] Fundação: monorepo, auth, modelo de dados, dois ambientes
- [x] Assistente pessoal: chat, memória controlável, tarefas, uso
- [x] Confirmação humana de ações sensíveis + auditoria
- [x] Organizações, leads e base de conhecimento (estrutura)
- [ ] Pipeline de documentos: extração → chunking → embeddings → busca vetorial
- [ ] BullMQ/Redis: processamento assíncrono, lembretes, retentativas
- [ ] Planos e billing: checkout, webhooks, franquias por plano
- [ ] Beta fechado com métricas de ativação, retenção e custo por cliente

## Sobre o projeto

Desenvolvido como projeto de portfólio seguindo um documento de planejamento
completo (produto, arquitetura, monetização, segurança e cronograma).
Nome provisório "NovaMind" — sujeito a validação de marca e domínio.
