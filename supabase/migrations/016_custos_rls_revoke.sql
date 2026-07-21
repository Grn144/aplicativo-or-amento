-- 016_custos_rls_revoke.sql
-- Fecha o vazamento de dados financeiros de obras encontrado na revisão de
-- segurança: o mascaramento (lib/permissoes/mascarar.ts) só agia na camada de
-- API, mas o RLS de obras/grupos/itens é USING(true) — qualquer usuário
-- autenticado lia custo/markup/fee direto do PostgREST (supabase.from(...).select).
-- O RLS filtra LINHAS, não COLUNAS, então a proteção por coluna é feita com
-- REVOKE SELECT a nível de coluna do papel authenticated/anon. As leituras
-- legítimas dessas colunas passam a ser feitas server-side com o service_role
-- (createAdminClient), que ignora RLS e grants, sempre após checagem de permissão.
-- Ver docs/superpowers/plans/2026-07-21-seguranca-custos-rls.md
--
-- REVOKE é idempotente: revogar um privilégio já ausente é no-op silencioso.
-- As escritas (INSERT/UPDATE) NÃO são afetadas — só o SELECT dessas colunas.

REVOKE SELECT (custo_unit_mao_obra, custo_unit_material,
               markup_mao_obra, markup_material,
               fee_mao_obra, fee_material)
  ON itens_orcamento FROM authenticated, anon;

REVOKE SELECT (fee_fator, comissao_valor, imposto_valor)
  ON obras FROM authenticated, anon;
