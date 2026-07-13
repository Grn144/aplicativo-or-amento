-- 011_composicao_usos.sql
-- Fase B2 do Banco de Composições: histórico de uso (contagem, último uso,
-- usuário) por composição. Log append-only — nunca é atualizado ou apagado.
-- Ver docs/superpowers/specs/2026-07-13-banco-composicoes-b2-design.md

CREATE TABLE composicao_usos (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  composicao_id     uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
  composicao_versao integer NOT NULL,
  obra_id           uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  usuario_id        uuid REFERENCES usuarios(id),
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON composicao_usos (composicao_id);
CREATE INDEX ON composicao_usos (obra_id);

-- RLS: mesmo padrão de itens_write (leitura ampla, escrita restrita aos
-- mesmos papéis que podem inserir itens no orçamento). Sem política de
-- UPDATE/DELETE — o log é imutável, mesmo padrão de composicao_versoes.
ALTER TABLE composicao_usos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "composicao_usos_select" ON composicao_usos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "composicao_usos_insert" ON composicao_usos
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));
