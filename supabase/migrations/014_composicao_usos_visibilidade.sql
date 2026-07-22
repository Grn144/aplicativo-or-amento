  -- 014_composicao_usos_visibilidade.sql
  -- Fecha uma lacuna encontrada na revisão final da Fase 1 (RBAC/permissões):
  -- composicao_usos_select estava aberta a qualquer autenticado, vazando
  -- histórico de uso do banco de composições pra quem não tem
  -- visualizar_banco_composicoes. Ver docs/superpowers/specs/2026-07-20-rbac-permissoes-design.md

  ALTER POLICY "composicao_usos_select" ON composicao_usos
    USING (has_permissao('visualizar_banco_composicoes'));
