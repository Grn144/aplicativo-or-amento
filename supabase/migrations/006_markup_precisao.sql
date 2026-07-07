-- 006_markup_precisao.sql
-- Aumenta a precisão do markup para 6 casas decimais. O markup importado é
-- derivado de $ ÷ (custo × fee), que raramente é um número redondo; com 4 casas
-- o total acumulava um resíduo de centavos. Com 6 casas o total do orçamento
-- reproduz a planilha exatamente.

ALTER TABLE itens_orcamento
  ALTER COLUMN markup_mao_obra TYPE numeric(12,6),
  ALTER COLUMN markup_material TYPE numeric(12,6);
