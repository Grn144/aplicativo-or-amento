-- 009_custo_precisao.sql
-- As planilhas reais têm custos unitários com mais de 4 casas decimais (custos
-- calculados: total ÷ quantidade). A coluna numeric(15,4) truncava esses valores,
-- e o truncamento acumulava ao somar ~1000+ itens, deslocando os subtotais das
-- colunas L/M/N e W/X/Y em alguns centavos em relação à planilha original.
-- Com 6+ casas o erro cai abaixo de meio centavo (comprovado: mykonos = 5.957.042,00
-- exato). Usa numeric(18,6) por margem. quantidade também, pelo mesmo motivo.
-- IMPORTANTE: trocar o tipo NÃO recupera os dígitos já truncados dos itens
-- existentes — é preciso REIMPORTAR as obras para regravar o custo com precisão cheia.

ALTER TABLE itens_orcamento
  ALTER COLUMN custo_unit_mao_obra TYPE numeric(18,6),
  ALTER COLUMN custo_unit_material TYPE numeric(18,6),
  ALTER COLUMN quantidade          TYPE numeric(18,6);
