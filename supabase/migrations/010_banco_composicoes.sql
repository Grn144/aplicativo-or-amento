-- 010_banco_composicoes.sql
-- Fase B1 do Banco de Composições Reutilizável: cadastro + estrutura
-- (materiais + mão de obra) + biblioteca (busca/favoritos) + versionamento
-- por snapshot + rastreabilidade em itens_orcamento.
-- Ver docs/superpowers/specs/2026-07-10-banco-composicoes-nucleo-design.md
--
-- Composição tem só Materiais e Mão de obra (sem Equipamentos/Serviços
-- Terceirizados) — casa com os dois buckets de custo que itens_orcamento
-- já tem (custo_unit_material/custo_unit_mao_obra).

  CREATE TABLE composicoes (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo            text NOT NULL UNIQUE,
    nome              text NOT NULL,
    disciplina_id     uuid REFERENCES disciplinas(id),
    descricao_tecnica text NOT NULL,
    unidade_id        uuid REFERENCES unidades_medida(id),
    produtividade     text,
    custo_direto      numeric(18,6) NOT NULL DEFAULT 0,
    markup_sugerido   numeric(18,10) NOT NULL DEFAULT 1,
    observacoes       text,
    tags              text[] NOT NULL DEFAULT '{}',
    versao            integer NOT NULL DEFAULT 1,
    ativo             boolean NOT NULL DEFAULT true,
    responsavel_id    uuid REFERENCES usuarios(id),
    criado_em         timestamptz NOT NULL DEFAULT now(),
    atualizado_em     timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE composicao_materiais (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    composicao_id  uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
    descricao      text NOT NULL,
    quantidade     numeric(18,6) NOT NULL,
    unidade_id     uuid REFERENCES unidades_medida(id),
    fornecedor     text,
    preco_unitario numeric(18,6) NOT NULL,
    ordem          integer NOT NULL
  );

  CREATE TABLE composicao_mao_obra (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    composicao_id  uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
    cargo          text NOT NULL,
    horas          numeric(18,6) NOT NULL,
    custo_hora     numeric(18,6) NOT NULL,
    ordem          integer NOT NULL
  );

  CREATE TABLE composicao_versoes (
    id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    composicao_id  uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
    versao         integer NOT NULL,
    snapshot       jsonb NOT NULL,
    usuario_id     uuid REFERENCES usuarios(id),
    criado_em      timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE composicoes_favoritas (
    usuario_id     uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    composicao_id  uuid NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
    criado_em      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, composicao_id)
  );

  -- Rastreabilidade: item pode vir de uma composição (nullable — item digitado
  -- manualmente continua sem referência). SET NULL: excluir a composição não
  -- pode apagar nem travar itens já inseridos em orçamentos.
  ALTER TABLE itens_orcamento
    ADD COLUMN composicao_id     uuid REFERENCES composicoes(id) ON DELETE SET NULL,
    ADD COLUMN composicao_versao integer;

  CREATE INDEX ON composicao_materiais (composicao_id);
  CREATE INDEX ON composicao_mao_obra (composicao_id);
  CREATE INDEX ON composicao_versoes (composicao_id);
  CREATE INDEX ON composicoes (disciplina_id);
  CREATE INDEX ON itens_orcamento (composicao_id);

  -- RLS: mesmo padrão de disciplinas/unidades_medida (leitura ampla para
  -- autenticados, escrita restrita por papel). get_user_papel() já existe.
  ALTER TABLE composicoes            ENABLE ROW LEVEL SECURITY;
  ALTER TABLE composicao_materiais   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE composicao_mao_obra    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE composicao_versoes     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE composicoes_favoritas  ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "composicoes_select" ON composicoes
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "composicoes_write" ON composicoes
    FOR ALL TO authenticated
    USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
    WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

  CREATE POLICY "composicao_materiais_select" ON composicao_materiais
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "composicao_materiais_write" ON composicao_materiais
    FOR ALL TO authenticated
    USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
    WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

  CREATE POLICY "composicao_mao_obra_select" ON composicao_mao_obra
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "composicao_mao_obra_write" ON composicao_mao_obra
    FOR ALL TO authenticated
    USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
    WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

  CREATE POLICY "composicao_versoes_select" ON composicao_versoes
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "composicao_versoes_insert" ON composicao_versoes
    FOR INSERT TO authenticated
    WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

  -- Favoritos: cada usuário só vê/gerencia os próprios
  CREATE POLICY "composicoes_favoritas_own" ON composicoes_favoritas
    FOR ALL TO authenticated
    USING (usuario_id = auth.uid())
    WITH CHECK (usuario_id = auth.uid());
