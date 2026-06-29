-- 002_rls_policies.sql

ALTER TABLE clientes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades_medida    ENABLE ROW LEVEL SECURITY;
ALTER TABLE obras              ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupos_orcamento   ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_orcamento    ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_alteracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_pendente       ENABLE ROW LEVEL SECURITY;

-- Helper: retorna papel do usuário autenticado
CREATE OR REPLACE FUNCTION get_user_papel()
RETURNS text AS $$
  SELECT COALESCE(papel, 'none') FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- Clientes
CREATE POLICY "clientes_select" ON clientes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_write" ON clientes
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Usuários: cada um vê os próprios dados; admin vê todos
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR get_user_papel() = 'admin');
CREATE POLICY "usuarios_write" ON usuarios
  FOR ALL TO authenticated
  USING (get_user_papel() = 'admin')
  WITH CHECK (get_user_papel() = 'admin');

-- Disciplinas
CREATE POLICY "disciplinas_select" ON disciplinas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "disciplinas_write" ON disciplinas
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Unidades de medida
CREATE POLICY "unidades_select" ON unidades_medida
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "unidades_write" ON unidades_medida
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Obras
CREATE POLICY "obras_select" ON obras
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "obras_insert" ON obras
  FOR INSERT TO authenticated
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));
CREATE POLICY "obras_update" ON obras
  FOR UPDATE TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'));
CREATE POLICY "obras_delete" ON obras
  FOR DELETE TO authenticated
  USING (get_user_papel() = 'admin');

-- Grupos
CREATE POLICY "grupos_select" ON grupos_orcamento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "grupos_write" ON grupos_orcamento
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Itens
CREATE POLICY "itens_select" ON itens_orcamento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "itens_write" ON itens_orcamento
  FOR ALL TO authenticated
  USING (get_user_papel() IN ('admin','engenheiro','orcamentista'))
  WITH CHECK (get_user_papel() IN ('admin','engenheiro','orcamentista'));

-- Histórico
CREATE POLICY "historico_select" ON historico_alteracoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "historico_insert" ON historico_alteracoes
  FOR INSERT TO authenticated WITH CHECK (true);

-- MFA: usuário só acessa o próprio registro
CREATE POLICY "mfa_own" ON mfa_pendente
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
