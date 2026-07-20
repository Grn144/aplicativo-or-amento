# Módulo de Gerenciamento de Usuários — Fase 2: Tela de Usuários

## Contexto

Continuação do módulo de Usuários depois da Fase 1 (RBAC + motor de permissões, concluída e mesclada em `master`). Esta fase entrega a UI de gerenciamento: listagem, cadastro/edição e atribuição de permissões individuais.

O pedido original descrevia 4 abas no cadastro (Dados Gerais, Segurança, Permissões, Auditoria), mas duas delas dependem de dados que não existem ainda:
- **Auditoria** (criado por, última alteração, histórico completo) precisa de `audit_logs`/`login_logs` — Fase 3.
- **Segurança** — os campos pedidos (último login/IP/dispositivo/navegador, sessões ativas, expiração de senha) também são Fase 3/4; "obrigar troca de senha" e "expiração de senha" não existem no Supabase Auth nativamente.

Por isso a Fase 2 cobre **só** Dados Gerais + Permissões. As outras duas abas só aparecem quando as Fases 3/4 tiverem dados reais para mostrar — evita UI vazia/placeholder.

## Escopo

### Migração de dados

A tabela `usuarios` hoje só tem `id, nome, email, papel, ativo, criado_em`. Ganha 3 colunas novas, opcionais, sem infraestrutura nova (sem upload de arquivo):
- `cargo text`
- `departamento text`
- `telefone text`

CPF, foto (upload) e observações ficam de fora — pedidos originais, mas fora do escopo desta fase (CPF/observações por não terem uso definido ainda; foto por exigir configurar Supabase Storage, uma capacidade nova no projeto).

### Bloqueio de usuário inativo

A coluna `usuarios.ativo` já existe, mas hoje não é verificada em lugar nenhum — desativar um usuário não bloqueia o login dele de verdade. Esta fase corrige isso: `middleware.ts` passa a checar `usuarios.ativo` a cada requisição autenticada (mesmo ponto onde já checa `mfa_verificado`); se `false`, desloga e redireciona para `/login`, no mesmo padrão silencioso já usado para sessão expirada (sem mensagem de erro nova — o projeto não tem convenção de passar mensagens de erro por query string para a tela de login, e não é o momento de criar uma só para este caso).

### Criação de usuário — convite por email

Sem campo de senha no formulário de criação. Ao salvar um usuário novo:
1. `createAdminClient().auth.admin.generateLink({ type: 'invite', email })` gera o link de convite.
2. Insere a linha em `usuarios` (nome, email, papel, cargo, departamento, telefone, `ativo: true`).
3. Envia email via Resend com o link, reaproveitando a página `/nova-senha` já existente (que hoje só lida com `type: 'recovery'` — ver Arquitetura).

Se o passo 1 ou 3 falhar, a linha em `usuarios` não é criada (falha atômica: sem usuário "órfão" sem conta de auth correspondente).

### Resetar senha

Reaproveita a rota já existente `POST /api/auth/reset-password` (gera link de recuperação + envia por Resend) — sem rota nova. O botão da listagem só chama esse endpoint passando o email do usuário-alvo.

### Listagem de usuários

Tela em `app/(app)/usuarios`, protegida por `editar_usuarios` (server-side, redireciona se não tiver a permissão — mesmo princípio de proteção que RLS/rotas já aplicam ao resto do sistema).

Busca tudo de uma vez (sem filtro/paginação no servidor — GET `/api/usuarios` retorna a lista completa) e filtra/ordena/pagina no cliente, no mesmo padrão do `TabelaUltimosOrcamentos` já existente:
- Filtros: nome/email (busca livre), papel, status (ativo/inativo). Sem filtro de "último acesso" (dado de Fase 3, não existe ainda).
- Ordenação por clique no cabeçalho da coluna (asc/desc), mesmo padrão do componente de referência.
- Paginação com seletor de quantidade por página (10/25/50) — pedido explícito do escopo original; pequena adição sobre o padrão de referência, que hoje tem paginação fixa em 10.
- Colunas: avatar com iniciais (em vez de foto — não há upload nesta fase), nome, email, cargo, departamento, papel, status, criado em, ações.
- Ações por linha: **Editar** (abre o modal na aba Dados Gerais), **Resetar Senha**, **Desativar**/**Reativar** (toggle de `ativo`, com confirmação). **Sem** botão de excluir (o pedido original nunca lista exclusão de usuário — só desativar/reativar — e o sistema já segue soft-delete como princípio) e **sem** botão de "Ver Auditoria" (a aba não existe nesta fase).
- Botão "Novo Usuário" no topo, abre o mesmo modal em modo criação.

### Cadastro/edição de usuário (modal com abas)

- **Aba Dados Gerais**: nome, email (bloqueado na edição — trocar o email de uma conta do Supabase Auth é um fluxo à parte, fora de escopo desta fase), telefone, cargo, departamento, papel (select com os 6 papéis), status ativo/inativo.
- **Aba Permissões**: as 25 permissões do catálogo (`lib/permissoes/matriz.ts`), cada uma como um switch. Pré-marcado conforme a permissão efetiva atual do usuário (papel + overrides já salvos). No modo criação (usuário ainda não existe, sem overrides possíveis), os switches partem do padrão do papel selecionado no dropdown e se recalculam ao trocar o papel, antes mesmo de salvar. Salvar recalcula os overrides: para cada permissão, compara o valor do switch contra o padrão do papel (`calcularPermissoes`); se igual ao padrão, remove qualquer override existente; se diferente, grava/atualiza o override. Isso mantém `usuario_permissoes` só com exceções reais, sem redundância. Esta aba só fica habilitada se o usuário logado tiver `alterar_permissoes` — quem só tem `editar_usuarios` edita Dados Gerais mas não mexe em permissões de terceiros.
- Trocar o papel de um usuário **não** apaga os overrides existentes dele — overrides são exceções pessoais, não amarradas ao papel anterior.

### Menu lateral

Novo item "Usuários" no `Sidebar`, entre Clientes e o rodapé (não existe "Configurações" ainda, então "entre Clientes e Configurações" do pedido original vira só "logo após Clientes"). Só aparece se `usuario.permissoes.has('editar_usuarios')` — nunca aparece desabilitado, some por completo pra quem não tem a permissão, seguindo o mesmo princípio já usado no botão de excluir do dashboard (`podeExcluir`). Isso exige que `app/(app)/layout.tsx` passe a buscar as permissões do usuário (via `obterUsuarioComPermissoes`, já pronto da Fase 1) e repasse pro `Sidebar`.

### Fora de escopo (fases seguintes)

- Abas Segurança e Auditoria no cadastro — Fase 3/4, quando `audit_logs`/`login_logs`/sessões existirem.
- CPF, observações, upload de foto.
- Troca de email de um usuário existente.
- Autenticação em dois fatores, expiração de senha, obrigar troca de senha no primeiro acesso.
- Exclusão definitiva de usuário (o sistema é soft-delete por princípio; não há botão de excluir usuário nesta fase nem nas seguintes, só desativar).
- Edição da matriz de permissões por papel via UI (decisão já tomada na Fase 1 — a matriz é fixa no código).

## Arquitetura

- Migration `supabase/migrations/015_usuarios_dados_gerais.sql`: `ALTER TABLE usuarios ADD COLUMN cargo text, ADD COLUMN departamento text, ADD COLUMN telefone text;`. Sem mudança de RLS — as policies `usuarios_select`/`usuarios_write` de `002_rls_policies.sql` já cobrem a linha inteira.
- `middleware.ts`: depois de obter `mfaVerificado`, uma query a mais em `usuarios.ativo` pelo `user.id`; se `false`, mesmo bloco de `signOut()` + redirect + limpeza de cookies já usado no caso de sessão antiga.
- Rotas novas, todas seguindo o padrão early-return já usado no projeto (`obterUsuarioComPermissoes` + `requirePermission` de `@/lib/permissoes/servidor`, igual às rotas da Fase 1):
  - `GET /api/usuarios` — lista completa, protegida por `editar_usuarios`.
  - `POST /api/usuarios` — cria usuário (Auth + linha em `usuarios`) + convite por email, protegida por `editar_usuarios`.
  - `GET /api/usuarios/[id]` — detalhe + permissões efetivas e overrides brutos, protegida por `editar_usuarios`.
  - `PUT /api/usuarios/[id]` — atualiza dados gerais/papel/ativo, protegida por `editar_usuarios`.
  - `PUT /api/usuarios/[id]/permissoes` — salva overrides (diff contra o padrão do papel), protegida por `alterar_permissoes`.
  - Resetar senha: sem rota nova, reaproveita `POST /api/auth/reset-password`.
- `app/(auth)/nova-senha/page.tsx`: hoje chama `verifyOtp({ type: 'recovery', token_hash })` fixo. Passa a ler o tipo de um novo parâmetro de query (`?tipo=invite` no link de convite, ausente/`recovery` no link de reset), repassando pra `verifyOtp({ type, token_hash })`. Único ponto tocado numa página já existente — o resto do fluxo (definir senha, sign out, redirecionar pro login) não muda.
- `app/(app)/layout.tsx`: passa a buscar `obterUsuarioComPermissoes` (já existe da Fase 1) além de `nome`/`papel`, repassando as permissões pro `Sidebar`.
- `components/layout/Sidebar.tsx`: novo item "Usuários" (ícone `UserCog`), renderizado condicionalmente por `permissoes.has('editar_usuarios')`.
- `components/ui/tabs.tsx` e `components/ui/switch.tsx` — novos primitivos shadcn (nenhum dos dois existe no projeto hoje), mesma origem dos componentes já presentes em `components/ui/`.
- `app/(app)/usuarios/page.tsx` (server component) — checa `editar_usuarios`, redireciona se faltar, renderiza `UsuariosPageClient`.
- `components/usuarios/UsuariosPageClient.tsx` — listagem com filtros/ordenação/paginação client-side (padrão de `components/dashboard/TabelaUltimosOrcamentos.tsx`), ações por linha.
- `components/usuarios/UsuarioModal.tsx` — modal de criar/editar com `Tabs` (Dados Gerais + Permissões), reaproveitando o padrão de `ComposicaoModal.tsx` (um modal único para os dois modos).

## Testes

- `middleware.test.ts` (não existe ainda um arquivo de teste pra `middleware.ts` — primeiro a ser criado) cobrindo o novo bloqueio de usuário inativo.
- Sem teste dedicado para as novas rotas de API, mesma convenção já estabelecida na Fase 1 (o projeto não testa rotas de API, só lib/*).
- Lógica de diff de overrides (comparar switches contra o padrão do papel) isolada em `lib/permissoes/diff-overrides.ts` (`calcularOverrides(papel: Papel, permissoesDesejadas: Set<Permissao>): OverridePermissao[]`, reaproveitando `calcularPermissoes` da Fase 1), com teste dedicado — mesmo padrão de TDD já usado nos módulos de `lib/permissoes/`.
- Sem teste dedicado para os componentes de tela novos, mesma convenção do restante de `components/composicoes`/`components/orcamento` (a maioria não tem `.test.tsx`).
