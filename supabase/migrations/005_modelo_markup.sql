-- 005_modelo_markup.sql
-- Modelo FEE + markup por item + fatores de rentabilidade por obra.

ALTER TABLE obras
  ADD COLUMN fee_fator    numeric(8,4) NOT NULL DEFAULT 1.02,
  ADD COLUMN comissao_pct numeric(8,4) NOT NULL DEFAULT 12,
  ADD COLUMN imposto_pct  numeric(8,4) NOT NULL DEFAULT 30;

ALTER TABLE itens_orcamento
  ADD COLUMN markup_mao_obra numeric(8,4) NOT NULL DEFAULT 1,
  ADD COLUMN markup_material numeric(8,4) NOT NULL DEFAULT 1;

ALTER TABLE itens_orcamento
  DROP COLUMN margem_mao_obra_pct,
  DROP COLUMN margem_material_pct;
