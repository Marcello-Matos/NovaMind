# Guia de deploy e login social — NovaMind

Passo a passo das configurações que **você** precisa fazer fora do código.
Tempo estimado total: ~40 min (a parte da Apple é a mais longa).

---

## 1. Banco de dados — Neon (Postgres + pgvector)

O Neon é Postgres serverless gratuito e suporta a extensão `vector`.

1. Crie a conta em https://neon.tech e um projeto novo (nome: `novamind`)
2. No dashboard, abra **SQL Editor** e rode uma vez:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. Copie a **connection string** (Dashboard → Connect → "psql")
   — formato `postgresql://user:senha@ep-xxx.us-east-2.aws.neon.tech/novamind?sslmode=require`
4. Aplique as migrations:

   ```bash
   DATABASE_URL="<sua-connection-string>" npx prisma migrate deploy
   # rode dentro de apps/api
   ```

5. Guarde a connection string — ela vai na variável `DATABASE_URL` do Render.

---

## 2. Hospedagem — Render (API + App web)

O `render.yaml` na raiz é um **Blueprint**: cria os dois serviços de uma vez.

1. Suba o repositório para o GitHub (`git push`)
2. No Render: **New → Blueprint** → conecte o repositório → ele detecta o `render.yaml`
3. Preencha as variáveis marcadas `sync: false`:

   | Serviço | Variável | Valor |
   |---|---|---|
   | `novamind-api` | `DATABASE_URL` | connection string do Neon (passo 1) |
   | `novamind-api` | `OPENAI_API_KEY` | sua chave da OpenAI |
   | `novamind-api` | `GOOGLE_CLIENT_IDS` | ver passo 3 |
   | `novamind-api` | `APPLE_CLIENT_IDS` | ver passo 4 |
   | `novamind-app` | `GOOGLE_CLIENT_ID` | o **Web** Client ID do Google |

4. `JWT_SECRET` é gerado automaticamente. `WEB_ORIGIN` já aponta para
   `https://novamind-app.onrender.com` — ajuste se o nome do serviço mudar.

### Limitações do plano free

- **Sleep**: a API dorme após ~15 min sem tráfego. O primeiro acesso
  demora ~30–60s (cold start). Para ficar sempre no ar: `plan: starter`
  (~US$7/mês) no `render.yaml`.
- O build do Flutter web baixa o SDK inteiro (~5–10 min por deploy).
- O app web usa URL com hash (`/#/chat`) — não precisa de rewrites de SPA.

---

## 3. Login Google — Google Cloud Console

1. https://console.cloud.google.com → crie um projeto (`novamind`)
2. **APIs & Services → OAuth consent screen**: External, preencha nome/e-mail
3. **Credentials → Create Credentials → OAuth client ID** — crie **3**:

   | Tipo | Config |
   |---|---|
   | **Web application** | Authorized JS origins: `http://localhost:3000` e `https://novamind-app.onrender.com` |
   | **iOS** | Bundle ID: `com.novamind.novamindApp` |
   | **Android** | Package: `com.novamind.novamindApp` + SHA-1 do seu keystore (`keytool -list -v -keystore ~/.android/debug.keystore`, senha `android`) |

4. `GOOGLE_CLIENT_IDS` na API = os 3 Client IDs **separados por vírgula**
5. `GOOGLE_CLIENT_ID` no app (dart-define/env do Render) = **só o Web Client ID**
6. **iOS**: no `ios/Runner/Info.plist`, adicione o `CFBundleURLTypes` com o
   *reversed client ID* do iOS Client ID (o Xcode/Google mostra no console):

   ```xml
   <key>CFBundleURLTypes</key>
   <array>
     <dict>
       <key>CFBundleURLSchemes</key>
       <array><string>com.googleusercontent.apps.SEU-IOS-CLIENT-ID-INVERTIDO</string></array>
     </dict>
   </array>
   ```

7. **Android**: com o SHA-1 registrado no console, funciona sem arquivos
   extras em modo debug.

---

## 4. Login Apple — Apple Developer

Requer conta Apple Developer paga (US$ 99/ano). Sem ela, o botão Apple
não aparece (o código já esconde quando não configurado).

### iOS/macOS (nativo)

1. https://developer.apple.com → **Certificates, IDs & Profiles → Identifiers**
2. Edite/crie o App ID `com.novamind.novamindApp` → ative
   **Sign In with Apple** capability
3. O projeto já tem `Runner.entitlements` com a capability — basta abrir
   no Xcode e selecionar seu Time em **Signing & Capabilities**

### Web (opcional — só para o botão Apple no site)

1. **Identifiers → + → Services IDs** → crie ex.: `com.novamind.web`
   → marque "Sign In with Apple" → configure **Domains**:
   `novamind-app.onrender.com` e **Return URLs**:
   `https://novamind-app.onrender.com/`
2. `APPLE_CLIENT_IDS` na API = `com.novamind.novamindApp,com.novamind.web`
   (bundle id + service id, separados por vírgula)
3. No app (dart-define): `APPLE_SERVICE_ID=com.novamind.web` e
   `APPLE_REDIRECT_URI=https://novamind-app.onrender.com/`

---

## 5. Desenvolvimento local

```bash
# .env da raiz
GOOGLE_CLIENT_IDS=web-client-id,ios-client-id,android-client-id
APPLE_CLIENT_IDS=com.novamind.novamindApp

# rodar o app com os client IDs
cd apps/app && flutter run -d web-server --web-port=3000 \
  --dart-define=API_URL=http://localhost:3001 \
  --dart-define=GOOGLE_CLIENT_ID=seu-web-client-id.apps.googleusercontent.com
```

Sem `GOOGLE_CLIENT_ID`/keys configurados, os endpoints respondem
`401 "Login Google/Apple não configurado"` e o app continua funcionando
com e-mail/senha normalmente.

## Checklist rápido

- [ ] Neon: `CREATE EXTENSION vector` + `migrate deploy`
- [ ] Render: blueprint aplicado + env vars preenchidas
- [ ] Google: 3 OAuth Client IDs + origins configuradas
- [ ] iOS: URL scheme do client ID no Info.plist
- [ ] Apple: capability no App ID + time no Xcode (+ Service ID se web)
- [ ] Teste: `https://novamind-api.onrender.com/v1/health` → `{"status":"ok"}`
