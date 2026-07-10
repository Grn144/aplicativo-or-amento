-- 008_comissao_imposto_fee_manual.sql
-- Comissão e imposto deixam de ser percentuais calculados sobre o faturamento
-- e passam a ser valores em R$ digitados manualmente por proposta — é assim
-- que as planilhas reais da empresa funcionam (valor fixo, não fórmula).
-- FEE passa a poder ser sobrescrito por item (algumas planilhas reais têm
-- itens sem FEE, com fee_mao_obra=1, enquanto o resto da obra usa 1.02).

ALTER TABLE obras RENAME COLUMN comissao_pct TO comissao_valor;
ALTER TABLE obras RENAME COLUMN imposto_pct TO imposto_valor;
ALTER TABLE obras ALTER COLUMN comissao_valor TYPE numeric(15,4);
ALTER TABLE obras ALTER COLUMN imposto_valor TYPE numeric(15,4);
ALTER TABLE obras ALTER COLUMN comissao_valor SET DEFAULT 0;
ALTER TABLE obras ALTER COLUMN imposto_valor SET DEFAULT 0;
-- Os valores existentes eram percentuais (ex.: 12, 30) — não fazem sentido
-- como R$, então zeram para não virar "R$12,00" de comissão por engano.
UPDATE obras SET comissao_valor = 0, imposto_valor = 0;

ALTER TABLE itens_orcamento
  ADD COLUMN fee_mao_obra numeric(8,4),
  ADD COLUMN fee_material numeric(8,4);
