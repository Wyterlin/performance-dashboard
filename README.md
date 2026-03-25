# Performance Dashboard Semanal

Aplicacao para apresentar atividades semanais por secoes e mostrar metricas dinamicas de chamados via API do SULTS.

## Estrutura

- `frontend`: React + Vite (interface)
- `backend`: Node + Express (API interna, persistencia local e proxy do SULTS)

## Estrutura da apresentacao

- Chamados do SULTS: cards dinamicos por status
- Demais areas: secoes com lista de atividades

## Secoes fixas

- SAP Business One
- Shop Control 9
- Queries (Consultas)
- Banco de Dados (BD)
- Manutencao de Maquinas
- Treinamentos

## Requisitos

- Node.js 20+
- npm 10+

## Executar localmente

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend padrao: `http://localhost:4000`

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend padrao: `http://localhost:5173`

## Integracao SULTS

Edite `backend/.env`:

```env
SULTS_API_BASE_URL=https://api.sults.com.br/api/v1
SULTS_TICKET_PATH=/chamado/ticket
SULTS_API_TOKEN=SEU_TOKEN
SULTS_AUTH_HEADER=Authorization
SULTS_AUTH_SCHEME=
SULTS_DEFAULT_USER_ID=42
```

Para o endpoint atual, a autenticacao valida em `Authorization` com token puro (sem `Bearer`).
`SULTS_DEFAULT_USER_ID` define no backend o responsavel especifico para os chamados.
O frontend nao possui campo para mudar esse ID.

Situacoes exibidas em cards:
- Novo Chamado
- Concluído
- Resolvido
- Em Andamento
- Aguardando Solicitante
- Aguardando Responsável

## Endpoints internos

- `GET /api/health`
- `GET /api/defaults/topics`
- `GET /api/weeks`
- `GET /api/weeks/:weekCode`
- `PUT /api/weeks/:weekCode`
- `GET /api/tickets/summary`
