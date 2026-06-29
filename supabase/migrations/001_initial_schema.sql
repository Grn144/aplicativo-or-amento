-- 001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clientes
CREATE TABLE clientes (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  razao_social text NOT NULL,
  cnpj         text,
  endereco     text,
  criado_em    timestamptz DEFAULT now()
);

-- Usuários (espelha auth.users do Supabase)
CREATE TABLE usuarios (
  id        uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  nome      text NOT NULL,
  email     text NOT NULL UNIQUE,
  papel     text NOT NULL CHECK (papel IN ('admin','engenheiro','orcamentista','visualizador')),
  ativo     boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);

-- Disciplinas (cadastro aberto)
CREATE TABLE disciplinas (
  id    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome  text NOT NULL UNIQUE,
  ativo boolean DEFAULT true
);

-- Unidades de medida
CREATE TABLE unidades_medida (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sigla     text NOT NULL UNIQUE,
  descricao text
);

-- Obras
CREATE TABLE obras (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id     uuid REFERENCES clientes ON DELETE RESTRICT,
  codigo         text NOT NULL,
  nome           text NOT NULL,
  data_orcamento date,
  status         text NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','enviado','aprovado',
                                   'em_execucao','concluido','cancelado')),
  criado_por     uuid REFERENCES usuarios ON DELETE SET NULL,
  criado_em      timestamptz DEFAULT now(),
  atualizado_em  timestamptz DEFAULT now()
);

-- Grupos de orçamento (blocos A, B, C... dentro de uma obra)
CREATE TABLE grupos_orcamento (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  obra_id       uuid REFERENCES obras ON DELETE CASCADE,
  disciplina_id uuid REFERENCES disciplinas,
  letra         text NOT NULL,
  ordem         integer NOT NULL,
  UNIQUE (obra_id, letra)
);

-- Itens de orçamento
CREATE TABLE itens_orcamento (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  grupo_id            uuid REFERENCES grupos_orcamento ON DELETE CASCADE,
  numero              integer NOT NULL,
  descricao           text NOT NULL,
  local               text,
  unidade_id          uuid REFERENCES unidades_medida,
  quantidade          numeric(15,4) NOT NULL DEFAULT 0,
  custo_unit_mao_obra numeric(15,4) NOT NULL DEFAULT 0,
  custo_unit_material numeric(15,4) NOT NULL DEFAULT 0,
  margem_mao_obra_pct numeric(8,4)  NOT NULL DEFAULT 0,
  margem_material_pct numeric(8,4)  NOT NULL DEFAULT 0,
  observacao          text,
  observacao_2        text,
  ordem               integer NOT NULL,
  UNIQUE (grupo_id, numero)
);

-- Histórico de alterações
CREATE TABLE historico_alteracoes (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  obra_id        uuid REFERENCES obras ON DELETE CASCADE,
  usuario_id     uuid REFERENCES usuarios,
  campo          text NOT NULL,
  valor_anterior text,
  valor_novo     text,
  alterado_em    timestamptz DEFAULT now()
);

-- Tabela de MFA pendente (código OTP temporário)
CREATE TABLE mfa_pendente (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE,
  codigo     text NOT NULL,
  expires_at timestamptz NOT NULL,
  tentativas integer NOT NULL DEFAULT 0,
  UNIQUE (user_id)
);

-- Índices
CREATE INDEX ON obras (cliente_id);
CREATE INDEX ON obras (status);
CREATE INDEX ON grupos_orcamento (obra_id);
CREATE INDEX ON itens_orcamento (grupo_id);
CREATE INDEX ON historico_alteracoes (obra_id);
CREATE INDEX ON mfa_pendente (user_id);
