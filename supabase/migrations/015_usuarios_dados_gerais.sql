-- supabase/migrations/015_usuarios_dados_gerais.sql
-- Fase 2 do módulo de Usuários: campos adicionais de cadastro.
-- Ver docs/superpowers/specs/2026-07-20-tela-usuarios-design.md
--
-- CPF, foto (upload) e observações ficam de fora desta fase — CPF/observações
-- por não terem uso definido ainda, foto por exigir Supabase Storage (uma
-- capacidade nova no projeto, não só colunas de banco).

ALTER TABLE usuarios
  ADD COLUMN cargo        text,
  ADD COLUMN departamento text,
  ADD COLUMN telefone     text;
