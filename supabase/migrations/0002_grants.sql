-- Privilégios da tabela weekly_reports.
--
-- Rode SOMENTE se o app continuar retornando "permission denied for table
-- weekly_reports" mesmo com a chave secret/service_role correta.
-- Normalmente o Supabase já concede isso por padrão; este script existe para
-- projetos onde os privilégios padrão foram alterados.
--
-- Idempotente: pode ser executado mais de uma vez sem efeito colateral.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on table public.weekly_reports
  to service_role;

-- A sequência não é necessária (o id é uuid), mas fica registrado que
-- NENHUM privilégio é concedido a anon/authenticated de propósito:
-- o acesso acontece apenas pelo backend, com a chave secreta.
revoke all on table public.weekly_reports from anon, authenticated;
