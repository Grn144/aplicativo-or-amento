-- 003_seed.sql

INSERT INTO disciplinas (nome) VALUES
  ('SERVIÇOS TÉCNICOS'), ('PRÉ-OBRA'), ('CIVIL'), ('PISO'), ('FORRO'),
  ('ILUMINAÇÃO'), ('ELÉTRICA'), ('AC'), ('PINTURA'), ('SPK'),
  ('DETECÇÃO'), ('INFRAESTRUTURA'), ('MOBILIÁRIO'), ('LIMPEZA'),
  ('DRYWALL'), ('HIDRÁULICA')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO unidades_medida (sigla, descricao) VALUES
  ('M',    'Metro linear'),
  ('M2',   'Metro quadrado'),
  ('UNID', 'Unidade'),
  ('VB',   'Verba'),
  ('PTOS', 'Pontos')
ON CONFLICT (sigla) DO NOTHING;
