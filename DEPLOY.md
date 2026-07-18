# Deploy — Supabase + Vercel

Guia para publicar o Performance Dashboard. Arquitetura:

- **Frontend** (React/Vite) servido estaticamente pelo Vercel.
- **Backend** (Express) roda como **uma Serverless Function** no Vercel (`/api/*`).
- **Persistência** no **Supabase Postgres** (tabela `weekly_reports`).
- **Token do SULTS** e a **service_role key** ficam só como env vars no servidor.

> Você criou projetos novos numa conta nova do Supabase e do Vercel. Todos os
> passos abaixo são feitos nessas contas novas — nada depende da conta antiga.

---

## 1. Supabase — criar a tabela

1. Acesse o projeto novo no [app.supabase.com](https://app.supabase.com).
2. Menu **SQL Editor** → **New query**.
3. Cole o conteúdo de [`supabase/migrations/0001_weekly_reports.sql`](supabase/migrations/0001_weekly_reports.sql) e clique **Run**.
4. Confirme em **Table Editor** que a tabela `weekly_reports` apareceu.

### Pegar as credenciais
Em **Project Settings → API**:

| Valor | Onde usar |
|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | env `SUPABASE_URL` |
| **service_role** key (em *Project API keys*, revele com cuidado) | env `SUPABASE_SERVICE_ROLE_KEY` |

⚠️ A **service_role** ignora RLS. Ela é secreta e só pode existir no servidor
(Vercel env var / `.env` local). **Nunca** coloque no frontend nem commite.

---

## 2. Rodar localmente (opcional, para testar)

**Backend:**
```bash
cd backend
cp .env.example .env      # preencha SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SULTS_API_TOKEN
npm install
npm run dev               # http://localhost:4000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev               # http://localhost:5173 (usa http://localhost:4000/api por padrão)
```

Para simular o ambiente do Vercel (frontend + function juntos) você pode usar
`vercel dev` na raiz depois do passo 3.

---

## 3. Vercel — publicar

1. Em [vercel.com](https://vercel.com) (conta nova) → **Add New → Project**.
2. **Import** do repositório GitHub `performance-dashboard`.
   - A conta nova do Vercel precisa ter acesso a esse repositório no GitHub.
     Se o repo está em outra conta/organização, instale o app do Vercel nela
     ou transfira/compartilhe o acesso.
3. Em **Root Directory** deixe **VAZIO / `./`** (a **raiz** do repositório).
   ⚠️ **Não** selecione a pasta `frontend` aqui — se apontar para `frontend`,
   o build quebra (`frontend/frontend/package.json`, erro ENOENT) e a pasta
   `api/` nem é publicada. Veja Troubleshooting abaixo.
   O [`vercel.json`](vercel.json) já cuida do build:
   - build: `npm --prefix frontend install && npm --prefix frontend run build`
   - saída estática: `frontend/dist`
   - a pasta `api/` vira a Serverless Function automaticamente.
4. Em **Environment Variables**, adicione (Production e Preview):

   | Nome | Valor |
   |---|---|
   | `SUPABASE_URL` | URL do projeto Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `SULTS_API_TOKEN` | token da API SULTS |
   | `SULTS_DEFAULT_USER_ID` | *(opcional)* id do responsável a filtrar |
   | `SULTS_AUTH_SCHEME` | *(opcional, ex.: `Bearer`)* |

   `VITE_API_BASE_URL` **não** precisa ser setada — já vem de
   [`frontend/.env.production`](frontend/.env.production) como `/api` (mesma origem).

5. Clique **Deploy**. Ao terminar, teste `https://SEU-APP.vercel.app/api/health`
   → deve responder `{ "ok": true }`.

---

## 4. Checklist pós-deploy

- [ ] `/api/health` responde ok.
- [ ] A busca por período traz os chamados do SULTS (env `SULTS_API_TOKEN` ok).
- [ ] Criar/editar uma atividade e recarregar a página: os dados persistem
      (isso confirma que o Supabase está gravando).
- [ ] Conferir em **Table Editor → weekly_reports** que a linha da semana foi criada.

---

## Troubleshooting

**`npm error enoent ... /vercel/path0/frontend/frontend/package.json` (exit 254)**
O **Root Directory** do projeto no Vercel está apontando para `frontend`, e o
`buildCommand` acrescenta outro `frontend` por cima. Correção:
Vercel → **Settings → Build and Deployment → Root Directory** → deixe **vazio/`./`**
→ salve → **Redeploy**. (Com root = `frontend` a pasta `api/` também não seria
publicada, então esse ajuste é obrigatório.)

**Chamados mostram `Unexpected token 'T', "The page c"... is not valid JSON`**
A rota `/api/tickets/summary` caiu no 404 do Vercel (HTML) em vez da function.
Garanta que o deploy inclui `api/index.js` e o rewrite do [`vercel.json`](vercel.json)
(`/api/(.*)` → `/api`). Teste `/api/health` — se responder JSON, o roteamento está ok.

**Chamados mostram `Nao foi possivel consultar a API do SULTS`**
Isso já é JSON (não é mais erro de rota): falta/está inválida a env `SULTS_API_TOKEN`
no Vercel. Defina-a em Settings → Environment Variables e faça Redeploy.

## Notas

- **Cache de chamados**: o backend guarda o resultado do SULTS em memória por
  `TICKET_CACHE_TTL_MS` (padrão 10 min). Em serverless o cache é por instância e
  reinicia em cold start — comportamento esperado, sem impacto funcional.
- **Migrar dados antigos** do `backend/data/weekly-reports.json` (se houver): para
  cada objeto em `weeks`, dá pra inserir manualmente no SQL Editor
  (`insert into weekly_reports (week_code, start_date, end_date, summary, sections) values (...)`),
  ou me peça um script de importação.
- O antigo `backend/src/utils/fileStore.js` não é mais usado (pode remover depois).
