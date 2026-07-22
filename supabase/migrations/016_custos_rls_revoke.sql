-- 016_custos_rls_revoke.sql
-- Fecha o vazamento de dados financeiros de obras encontrado na revisão de
-- segurança: o mascaramento (lib/permissoes/mascarar.ts) só agia na camada de
-- API, mas o RLS de obras/itens é USING(true) — qualquer usuário autenticado
-- lia custo/markup/fee direto do PostgREST. O RLS filtra LINHAS, não COLUNAS.
--
-- IMPORTANTE: um REVOKE só de coluna NÃO adianta — no Postgres o acesso efetivo
-- é a UNIÃO do grant de tabela com o de coluna, e o Supabase concede SELECT de
-- TABELA por padrão a `authenticated`. Então revogamos o SELECT de TABELA e
-- re-concedemos SELECT só nas colunas NÃO sensíveis. As colunas sensíveis
-- (custo/markup/fee em itens; fee/comissao/imposto em obras) ficam ilegíveis
-- pelo papel authenticated; as leituras legítimas dessas colunas são feitas
-- server-side com o service_role (createAdminClient), que ignora grants e RLS.
--
-- MANUTENÇÃO: ao adicionar uma coluna NÃO sensível em obras/itens_orcamento no
-- futuro, inclua-a no GRANT abaixo (senão o papel authenticated não a lê).
-- Ver docs/superpowers/plans/2026-07-21-seguranca-custos-rls.md

-- itens_orcamento: revoga SELECT de tabela e re-concede só as colunas não sensíveis.
REVOKE SELECT ON itens_orcamento FROM authenticated, anon;
GRANT SELECT (id, grupo_id, numero, descricao, local, unidade_id, quantidade,
              observacao, observacao_2, ordem, composicao_id, composicao_versao)
  ON itens_orcamento TO authenticated;

-- obras: idem.
REVOKE SELECT ON obras FROM authenticated, anon;
GRANT SELECT (id, cliente_id, codigo, nome, data_orcamento, status,
              criado_por, criado_em, atualizado_em)
  ON obras TO authenticated;
