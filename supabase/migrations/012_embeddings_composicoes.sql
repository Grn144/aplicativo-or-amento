-- 012_embeddings_composicoes.sql
-- Fase B5b do Banco de Composições Reutilizável: busca por similaridade
-- semântica via embeddings (OpenAI text-embedding-3-small, 1536 dimensões).
-- Ver docs/superpowers/specs/2026-07-14-banco-composicoes-b5b-design.md
--
-- Sem índice ivfflat de propósito: no volume de dados esperado (biblioteca
-- de composições de uma empresa, não multi-tenant em larga escala), um scan
-- sequencial com o operador de distância de cosseno é rápido o suficiente,
-- e o ivfflat exige ajuste do parâmetro `lists` que só faz sentido depois de
-- conhecer o volume real de dados. Pode ser adicionado depois sem quebrar
-- nada caso a biblioteca cresça muito.

create extension if not exists vector;

alter table composicoes add column embedding vector(1536);
alter table composicao_materiais add column embedding vector(1536);

-- Busca as composições ativas com embedding mais próximas (menor distância
-- de cosseno) do embedding de consulta. Não aplica limiar de qualidade nem
-- decide quantas mostrar de fato — isso é responsabilidade da camada
-- TypeScript (lib/composicoes/embeddings-texto.ts), que filtra o resultado
-- bruto desta função por LIMIAR_SIMILARIDADE e corta em top-N.
create or replace function match_composicoes(
  query_embedding vector(1536),
  limite int
)
returns table (
  id uuid,
  codigo text,
  nome text,
  disciplina_nome text,
  similaridade float
)
language sql stable
as $$
  select
    c.id, c.codigo, c.nome,
    d.nome as disciplina_nome,
    1 - (c.embedding <=> query_embedding) as similaridade
  from composicoes c
  left join disciplinas d on d.id = c.disciplina_id
  where c.ativo = true
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit limite;
$$;

-- Busca materiais (de qualquer composição ativa) com embedding mais próximo
-- do embedding de consulta, opcionalmente excluindo os materiais de uma
-- composição específica (a que está sendo editada, pra não sugerir ela
-- mesma). Mesma filosofia da função acima: sem limiar de qualidade aqui.
create or replace function match_materiais(
  query_embedding vector(1536),
  limite int,
  excluir_composicao_id uuid
)
returns table (
  descricao text,
  fornecedor text,
  preco_unitario numeric,
  similaridade float
)
language sql stable
as $$
  select
    m.descricao, m.fornecedor, m.preco_unitario,
    1 - (m.embedding <=> query_embedding) as similaridade
  from composicao_materiais m
  join composicoes c on c.id = m.composicao_id
  where c.ativo = true
    and m.embedding is not null
    and (excluir_composicao_id is null or m.composicao_id <> excluir_composicao_id)
  order by m.embedding <=> query_embedding
  limit limite;
$$;
