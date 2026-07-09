-- 007_cliente_obrigatorio.sql
-- Toda obra passa a exigir um cliente vinculado (fecha o gap entre o tipo
-- TS já declarado obrigatório em types/database.ts e o schema, que hoje
-- aceita NULL).

ALTER TABLE obras
  ALTER COLUMN cliente_id SET NOT NULL;
