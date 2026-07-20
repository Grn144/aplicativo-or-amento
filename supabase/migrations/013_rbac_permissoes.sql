-- supabase/migrations/013_rbac_permissoes.sql
-- Fase 1 do módulo de Usuários: RBAC estendido (6 perfis) + permissões
-- individuais por usuário (overrides sobre o perfil).
-- Ver docs/superpowers/specs/2026-07-20-rbac-permissoes-design.md

-- 1. Migrar dados existentes ANTES de trocar a constraint (sem perda)
UPDATE usuarios SET papel = 'gerente'   WHERE papel = 'engenheiro';
UPDATE usuarios SET papel = 'visitante' WHERE papel = 'visualizador';

ALTER TABLE usuarios DROP CONSTRAINT usuarios_papel_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check
  CHECK (papel IN ('admin','gerente','orcamentista','comercial','financeiro','visitante'));

-- 2. Overrides individuais de permissão (exceção pontual sobre o perfil)
CREATE TABLE usuario_permissoes (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id   uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  permissao    text NOT NULL,
  concedida    boolean NOT NULL,
  criado_por   uuid REFERENCES usuarios,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, permissao)
);
CREATE INDEX ON usuario_permissoes (usuario_id);

ALTER TABLE usuario_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_permissoes_select" ON usuario_permissoes
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR get_user_papel() = 'admin');
CREATE POLICY "usuario_permissoes_write" ON usuario_permissoes
  FOR ALL TO authenticated
  USING (get_user_papel() = 'admin')
  WITH CHECK (get_user_papel() = 'admin');

-- 3. has_permissao(): espelha em SQL a mesma matriz padrão de
-- lib/permissoes/matriz.ts, combinada com os overrides de usuario_permissoes.
-- Usada só nas policies onde a diferença entre "papel" e "permissão efetiva"
-- importa pra RLS (hoje: exclusões e visibilidade do banco de composições).
CREATE OR REPLACE FUNCTION has_permissao(chave text)
RETURNS boolean AS $$
DECLARE
  papel_atual text := get_user_papel();
  override boolean;
  padrao boolean;
BEGIN
  SELECT concedida INTO override
  FROM usuario_permissoes
  WHERE usuario_id = auth.uid() AND permissao = chave;

  IF override IS NOT NULL THEN
    RETURN override;
  END IF;

  padrao := CASE papel_atual
    WHEN 'admin' THEN true
    WHEN 'gerente' THEN chave IN (
      'visualizar_dashboard','visualizar_indicadores','editar_clientes',
      'criar_obras','editar_obras','visualizar_custos','visualizar_margem','visualizar_lucro',
      'visualizar_banco_composicoes','cadastrar_composicoes','editar_composicoes',
      'importar_planilhas','exportar_planilhas'
    )
    WHEN 'orcamentista' THEN chave IN (
      'visualizar_dashboard','editar_clientes','criar_obras','editar_obras',
      'visualizar_custos','visualizar_banco_composicoes','importar_planilhas','exportar_planilhas'
    )
    WHEN 'comercial' THEN chave IN ('visualizar_dashboard','exportar_planilhas')
    WHEN 'financeiro' THEN chave IN (
      'visualizar_dashboard','visualizar_indicadores','visualizar_custos',
      'visualizar_margem','visualizar_lucro','visualizar_banco_composicoes',
      'importar_planilhas','exportar_planilhas'
    )
    WHEN 'visitante' THEN chave IN ('visualizar_dashboard')
    ELSE false
  END;

  RETURN COALESCE(padrao, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Policies existentes: troca de 'engenheiro' por 'gerente'
ALTER POLICY "disciplinas_write" ON disciplinas
  USING (get_user_papel() IN ('admin','gerente','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "unidades_write" ON unidades_medida
  USING (get_user_papel() IN ('admin','gerente','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "obras_insert" ON obras
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "obras_update" ON obras
  USING (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "grupos_write" ON grupos_orcamento
  USING (get_user_papel() IN ('admin','gerente','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "itens_write" ON itens_orcamento
  USING (get_user_papel() IN ('admin','gerente','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "composicao_versoes_insert" ON composicao_versoes
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

ALTER POLICY "composicao_usos_insert" ON composicao_usos
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));

-- 5. Exclusões passam a respeitar has_permissao() (permite overrides individuais)
ALTER POLICY "obras_delete" ON obras
  USING (has_permissao('excluir_obras'));

-- clientes_write cobria INSERT/UPDATE/DELETE junto — separa exclusão pra
-- poder gatear por excluir_clientes (perfil isolado, distinto de editar_clientes)
DROP POLICY "clientes_write" ON clientes;
CREATE POLICY "clientes_insert" ON clientes
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','gerente','orcamentista'));
CREATE POLICY "clientes_update" ON clientes
  FOR UPDATE TO authenticated
  USING (get_user_papel() IN ('admin','gerente','orcamentista'));
CREATE POLICY "clientes_delete" ON clientes
  FOR DELETE TO authenticated
  USING (has_permissao('excluir_clientes'));

-- composicoes_write cobria admin+engenheiro+orcamentista; a nova matriz
-- restringe cadastrar/editar_composicoes a admin+gerente (orçamentista passa
-- a só consultar o banco, não editá-lo — mudança de comportamento intencional,
-- ver docs/superpowers/specs/2026-07-20-rbac-permissoes-design.md)
DROP POLICY "composicoes_write" ON composicoes;
CREATE POLICY "composicoes_insert" ON composicoes
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','gerente'));
CREATE POLICY "composicoes_update" ON composicoes
  FOR UPDATE TO authenticated
  USING (get_user_papel() IN ('admin','gerente'));
CREATE POLICY "composicoes_delete" ON composicoes
  FOR DELETE TO authenticated
  USING (has_permissao('excluir_composicoes'));

DROP POLICY "composicao_materiais_write" ON composicao_materiais;
CREATE POLICY "composicao_materiais_write" ON composicao_materiais
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','gerente'))
  WITH CHECK (get_user_papel() IN ('admin','gerente'));

DROP POLICY "composicao_mao_obra_write" ON composicao_mao_obra;
CREATE POLICY "composicao_mao_obra_write" ON composicao_mao_obra
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','gerente'))
  WITH CHECK (get_user_papel() IN ('admin','gerente'));

-- 6. Visibilidade do banco de composições: Comercial e Visitante não veem
-- (matriz: visualizar_banco_composicoes = false pra eles)
ALTER POLICY "composicoes_select" ON composicoes
  USING (has_permissao('visualizar_banco_composicoes'));
ALTER POLICY "composicao_materiais_select" ON composicao_materiais
  USING (has_permissao('visualizar_banco_composicoes'));
ALTER POLICY "composicao_mao_obra_select" ON composicao_mao_obra
  USING (has_permissao('visualizar_banco_composicoes'));
ALTER POLICY "composicao_versoes_select" ON composicao_versoes
  USING (has_permissao('visualizar_banco_composicoes'));
