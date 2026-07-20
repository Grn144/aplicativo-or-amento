# Módulo de Gerenciamento de Usuários — Fase 1: RBAC e Permissões

## Contexto

Pedido original: um módulo completo de usuários, perfis, permissões, autenticação, auditoria, sessões e segurança ("Sistema Corporativo de Usuários"). O pedido foi escrito como uma especificação genérica de sistema corporativo, sem levar em conta a arquitetura já existente:

- Autenticação, hashing de senha, JWT e sessão já são gerenciados pelo **Supabase Auth** (`@supabase/ssr`), com MFA por e-mail já implementado (`mfa_pendente`, `/verificar`, cookie `mfa_verificado` com sliding TTL — ver `middleware.ts`, `lib/sessao.ts`).
- Já existe um RBAC simples: tabela `usuarios` com coluna `papel` (`admin`, `engenheiro`, `orcamentista`, `visualizador`), função SQL `get_user_papel()` e policies de RLS baseadas nela (`supabase/migrations/002_rls_policies.sql`).
- Rate limit já existe (`lib/rate-limit.ts`).
- Fluxo de recuperação de senha já existe (`/esqueci-senha`, `/nova-senha`, `app/api/auth/reset-password`).

Por isso o pedido foi decomposto em fases, cada uma com seu spec e plano próprios:

1. **RBAC + Permissões** *(este documento)*
2. Tela de Usuários (CRUD, abas Dados Gerais/Segurança/Permissões/Auditoria)
3. Auditoria + histórico de login + indicadores do dashboard admin
4. Sessões ativas + bloqueio de conta

A Fase 1 é pré-requisito das demais: sem o motor de permissões não há o que a tela de usuários edita, nem o que a auditoria audita.

## Escopo

### Migração de papéis

Estender os 4 papéis atuais para os 6 pedidos, mapeando os dados existentes (sem perda):

| Atual | Novo | Label |
|---|---|---|
| `admin` | `admin` | Administrador |
| `engenheiro` | `gerente` | Gerente |
| `orcamentista` | `orcamentista` | Orçamentista |
| `visualizador` | `visitante` | Visitante |
| *(novo)* | `comercial` | Comercial |
| *(novo)* | `financeiro` | Financeiro |

### Catálogo de permissões

Chaves em `snake_case` (convenção do projeto), cobrindo as ações sensíveis citadas no pedido. Visualização geral de clientes/obras/composições continua aberta a qualquer autenticado, como hoje — as chaves abaixo existem só onde o pedido pede restrição:

```
visualizar_dashboard, visualizar_indicadores,
editar_clientes, excluir_clientes,
criar_obras, editar_obras, excluir_obras,
visualizar_custos, editar_custos, visualizar_margem, visualizar_lucro,
visualizar_banco_composicoes, cadastrar_composicoes, editar_composicoes, excluir_composicoes,
importar_planilhas, exportar_planilhas,
cadastrar_usuarios, editar_usuarios, excluir_usuarios, alterar_permissoes,
visualizar_auditoria,
acessar_configuracoes, backup, restaurar_banco
```

### Matriz padrão por perfil

| Permissão | Admin | Gerente | Orçamentista | Comercial | Financeiro | Visitante |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| visualizar_dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| visualizar_indicadores | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| editar_clientes | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| excluir_clientes | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| criar_obras / editar_obras | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| excluir_obras | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| visualizar_custos | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| editar_custos | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| visualizar_margem / visualizar_lucro | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| visualizar_banco_composicoes | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| cadastrar_composicoes / editar_composicoes | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| excluir_composicoes | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| importar_planilhas | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| exportar_planilhas | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| cadastrar_usuarios / editar_usuarios / excluir_usuarios | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| alterar_permissoes | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| visualizar_auditoria | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| acessar_configuracoes / backup / restaurar_banco | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

Permissões não listadas para um perfil são `false` por padrão.

### Overrides individuais

Um usuário pode receber permissões além (ou aquém) do seu perfil, sem mudar de perfil — ex.: um Comercial que recebe só `visualizar_custos`. Guardado em `usuario_permissoes` (ver Modelo de dados), resolvido em cima da matriz padrão do perfil.

### Aplicação nas rotas existentes

- Rotas de escrita que hoje só checam `user` autenticado (criar/editar/excluir de clientes, obras, itens, composições) passam a checar a permissão correspondente, retornando 403 com mensagem amigável antes de tocar o banco.
- Campos financeiros sensíveis são removidos das respostas JSON de leitura quando o usuário não tem a permissão de visualização correspondente (nunca apenas ocultados no front): `GET /api/obras`, `GET /api/obras/[id]`, rotas de itens dentro de obras, `GET /api/composicoes*`, `GET /api/dashboard/export`.
- Campos afetados: `custo_unit_mao_obra`, `custo_unit_material`, `margem_mao_obra_pct`, `margem_material_pct`, `total_custo`/`subtotal_*_custo`, `lucro`, `margem_efetiva_pct`, `markup_*`, `preco_unit_*_venda` (quando aplicável a valor interno).
- `GET /api/obras/[id]/export`: a planilha `tipo=comercial` (14 colunas, só preço de venda) já não expõe custo/margem/lucro — nenhuma mudança necessária aí. A planilha `tipo=tecnico` (28 colunas, com custo/FEE/rentabilidade) passa a exigir `visualizar_custos`; sem a permissão, a rota responde 403 em vez de gerar o arquivo (não há como "mascarar" uma planilha cujo layout inteiro é sobre custo, então a saída binária desse tipo é tudo-ou-nada, diferente do JSON das outras rotas).

### RLS

- `get_user_papel()` e as policies existentes (`002_rls_policies.sql`) atualizadas para os 6 papéis novos.
- Nova função SQL `has_permissao(chave text)` (mesma lógica de resolução do `resolver.ts`, replicada em SQL) usada em policies que hoje são abertas a qualquer autenticado mas deveriam respeitar permissão — em particular `excluir_obras` e `excluir_composicoes`.

### Fora de escopo (fases seguintes ou fora do módulo)

- Qualquer UI nova (tela de usuários, item de menu "Usuários", abas de cadastro/permissões/auditoria) — Fase 2.
- Auditoria, histórico de login, indicadores de dashboard admin — Fase 3.
- Sessões ativas, bloqueio de conta após tentativas inválidas, encerrar sessão remotamente — Fase 4.
- Autenticação em dois fatores estruturada (TOTP) — o MFA por e-mail já existente não muda.
- Reimplementar hashing de senha, JWT, refresh token ou sessão — continua 100% Supabase Auth.
- Editar a matriz de permissões por perfil via UI — não solicitado; a matriz é fixa no código, só os overrides por usuário são dinâmicos (ver decisão acima).
- Backup e restauração de banco de fato (as permissões `backup`/`restaurar_banco` existem no catálogo para o admin poder gatear uma feature futura, mas nenhuma rota de backup/restore é criada nesta fase).

## Arquitetura

- `lib/permissoes/matriz.ts` — constante `MATRIZ_PADRAO: Record<Papel, ReadonlySet<Permissao>>` com a tabela acima. Tipos `Papel` (estendido) e `Permissao` (union das chaves do catálogo) exportados daqui.
- `lib/permissoes/resolver.ts` — `calcularPermissoes(papel: Papel, overrides: OverridePermissao[]): Set<Permissao>`, função pura: parte da matriz padrão do perfil e aplica cada override (`concedida: true` adiciona, `concedida: false` remove).
- `lib/permissoes/servidor.ts` — helpers para Route Handlers, seguindo o padrão já usado (early-return, sem middleware/wrapper que mude assinatura de rota):
  - `obterUsuarioComPermissoes(supabase)` → `{ usuario, permissoes } | null`.
  - `requireRole(papel, ...papeisPermitidos)` → boolean.
  - `requirePermission(permissoes, chave)` → boolean.
- `lib/permissoes/mascarar.ts` — `mascararCamposFinanceiros<T>(objeto: T, permissoes: Set<Permissao>): T`, remove por `delete` as chaves sensíveis listadas acima quando falta a permissão de visualização correspondente. Aplica recursivamente em arrays/objetos aninhados (ex.: `itens_orcamento` dentro de `grupos_orcamento` dentro de `obras`).
- Migration `supabase/migrations/013_rbac_permissoes.sql`:
  - `UPDATE usuarios SET papel = ...` mapeando valores antigos, **antes** de trocar o `CHECK` constraint para os 6 novos valores.
  - Nova tabela `usuario_permissoes`:
    ```sql
    CREATE TABLE usuario_permissoes (
      id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      usuario_id   uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
      permissao    text NOT NULL,
      concedida    boolean NOT NULL,
      criado_por   uuid REFERENCES usuarios,
      criado_em    timestamptz DEFAULT now(),
      UNIQUE (usuario_id, permissao)
    );
    ```
  - RLS em `usuario_permissoes`: escrita só para quem tem `alterar_permissoes` (na prática, `admin`); leitura para o próprio usuário e para admin.
  - Atualização de `get_user_papel()` e das policies de `002_rls_policies.sql` para os 6 papéis.
  - Nova função `has_permissao(chave text)`.

## Testes

- `lib/permissoes/resolver.test.ts` — cobertura completa da matriz (cada perfil × cada permissão) e casos de override (concede permissão que o perfil não tem; revoga permissão que o perfil tem).
- `lib/permissoes/mascarar.test.ts` — campos removidos/mantidos conforme permissão, incluindo caso aninhado (item dentro de grupo dentro de obra).
- `lib/permissoes/servidor.test.ts` — `obterUsuarioComPermissoes`, `requireRole`, `requirePermission` com Supabase mockado (mesmo padrão de mock usado em `lib/rate-limit.test.ts`).
- O projeto hoje não tem nenhum teste de rota de API (nenhum `*.test.ts` dentro de `app/api`) — só testes de `lib/*`. Esta fase segue essa mesma convenção: a lógica de decisão (matriz, resolução de overrides, máscara) é 100% coberta em `lib/permissoes/*.test.ts`; as rotas só chamam essas funções já testadas e retornam 403, sem teste dedicado próprio, como todas as rotas atuais.
