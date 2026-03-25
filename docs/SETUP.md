# Setup Tecnico

## Variaveis de ambiente (backend)

Arquivo: `.env`

- `PORT`: porta do backend (padrao 4000)
- `SULTS_API_BASE_URL`: base da API do SULTS
- `SULTS_TICKET_PATH`: caminho do endpoint de tickets
- `SULTS_API_TOKEN`: token de acesso
- `SULTS_AUTH_HEADER`: nome do cabecalho de autenticacao
- `SULTS_AUTH_SCHEME`: prefixo do token (neste endpoint, manter vazio)
- `SULTS_DEFAULT_USER_ID`: ID do responsavel para filtrar chamados
- `SULTS_TIMEOUT_MS`: timeout da chamada externa
- `TICKET_CACHE_TTL_MS`: cache de resumo de chamados

## Persistencia

O historico semanal e salvo em `backend/data/weekly-reports.json`.

## Fluxo de uso semanal

1. Abrir a semana atual no campo Semana (exemplo: `2026-W13`).
2. Preencher cada topico com quantidade, atividades e destaques.
3. Revisar card de Chamados e atualizar dados dinamicos.
4. Completar resumo da semana.
5. Clicar em Salvar Semana.
