-- 006_markup_precisao.sql
-- Aumenta a precisão do markup para 10 casas decimais. O markup importado é
-- derivado de $ ÷ (custo × fee), que raramente é um número redondo; com poucas
-- casas o total do orçamento acumulava um resíduo (centavos). Com 10 casas o
-- total reproduz a planilha exatamente (diferença 0,00 nos casos reais testados).
-- Seguro rodar mesmo que uma versão anterior desta migration já tenha rodado:
-- ALTER ... TYPE apenas amplia a precisão da coluna.

ALTER TABLE itens_orcamento
  ALTER COLUMN markup_mao_obra TYPE numeric(18,10),
  ALTER COLUMN markup_material TYPE numeric(18,10);
