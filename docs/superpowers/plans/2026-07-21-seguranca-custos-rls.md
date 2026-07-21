# Fechar vazamento de dados financeiros de obras (RLS + service_role) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que usuários sem `visualizar_custos` obtenham custos/markups/fees de obras por qualquer canal — fechando o buraco em que o mascaramento só existia na camada de API mas o RLS deixava as colunas legíveis por qualquer autenticado direto no PostgREST.

**Architecture:** O RLS do Postgres filtra linhas, não colunas, e o navegador (cliente anon + JWT) e o servidor usam o mesmo papel `authenticated` — então não dá pra "mascarar coluna por permissão" só com RLS. A correção: (1) **revogar no banco** o `SELECT` das colunas sensíveis do papel `authenticated`/`anon`, de modo que o navegador fique fisicamente impedido de lê-las via PostgREST direto; (2) **mover as leituras server-side** dessas colunas para o cliente `service_role` (`createAdminClient`), que ignora o RLS, sempre precedidas da checagem de permissão já existente e do mascaramento na fronteira; (3) o navegador passa a receber só **valores derivados** (ex.: `total_venda` calculado no servidor), nunca custo cru. As **escritas continuam** no cliente `authenticated` (guardadas pelo RLS) — só a releitura pós-escrita e as leituras sensíveis vão para o admin.

**Tech Stack:** Next.js 15 (App Router, Route Handlers, Server Components), Supabase (Postgres + RLS + service_role), `@supabase/ssr`, TypeScript, Vitest, ExcelJS.

## Global Constraints

- **Nada de custo/markup/fee cru chega ao navegador de quem não tem `visualizar_custos`.** Colunas sensíveis: em `itens_orcamento` → `custo_unit_mao_obra`, `custo_unit_material`, `markup_mao_obra`, `markup_material`, `fee_mao_obra`, `fee_material`; em `obras` → `fee_fator`, `comissao_valor`, `imposto_valor`.
- **As escritas continuam guardadas pelo RLS** no cliente `authenticated` — não mover INSERT/UPDATE para o admin. Só a *releitura* (`.select()` de volta) e as *leituras* de colunas sensíveis usam `createAdminClient()`.
- **O motor de cálculo "bate ao centavo" não pode mudar de comportamento.** Nenhuma alteração em `lib/calculos.ts`, `lib/composicoes/calculos.ts`, `lib/excel/*` de fórmula. A verificação final compara um export real ao centavo com o baseline.
- **Toda leitura sensível via admin é precedida da checagem `obterUsuarioComPermissoes` + `requirePermission`/mascaramento já estabelecida** (padrão early-return da Fase 1). O `obterUsuarioComPermissoes` continua no cliente `authenticated` (lê `usuarios`/`usuario_permissoes`, tabelas não afetadas pela revogação).
- **Editor de obra (`/obras/[id]`) exige `visualizar_custos`** — quem não tem é redirecionado (decisão do usuário: bloquear, não mascarar, para não tocar no motor do editor).
- **Sem teste dedicado para rotas de API nem componentes de tela** (convenção do projeto). Testes dedicados só para lógica pura nova, se houver.
- **Todo texto de erro/UI em português.**
- **Migration idempotente** (padrão do projeto — `REVOKE` já é idempotente por natureza; não usar `IF EXISTS` desnecessário).

---

### Task 1: Migration 016 — revogar SELECT das colunas sensíveis

**Files:**
- Create: `supabase/migrations/016_custos_rls_revoke.sql`

**Interfaces:**
- Produces: após aplicada, o papel `authenticated` (e `anon`) não consegue mais `SELECT` das colunas sensíveis de `obras`/`itens_orcamento` via PostgREST; `service_role` continua com acesso total. Nenhuma tabela/coluna nova.

- [ ] **Step 1: Escrever a migration**

```sql
-- 016_custos_rls_revoke.sql
-- Fecha o vazamento de dados financeiros de obras encontrado na revisão de
-- segurança: o mascaramento (lib/permissoes/mascarar.ts) só agia na camada de
-- API, mas o RLS de obras/grupos/itens é USING(true) — qualquer usuário
-- autenticado lia custo/markup/fee direto do PostgREST (supabase.from(...).select).
-- O RLS filtra LINHAS, não COLUNAS, então a proteção por coluna é feita com
-- REVOKE SELECT a nível de coluna do papel authenticated/anon. As leituras
-- legítimas dessas colunas passam a ser feitas server-side com o service_role
-- (createAdminClient), que ignora RLS e grants, sempre após checagem de permissão.
-- Ver docs/superpowers/plans/2026-07-21-seguranca-custos-rls.md
--
-- REVOKE é idempotente: revogar um privilégio já ausente é no-op silencioso.
-- As escritas (INSERT/UPDATE) NÃO são afetadas — só o SELECT dessas colunas.

REVOKE SELECT (custo_unit_mao_obra, custo_unit_material,
               markup_mao_obra, markup_material,
               fee_mao_obra, fee_material)
  ON itens_orcamento FROM authenticated, anon;

REVOKE SELECT (fee_fator, comissao_valor, imposto_valor)
  ON obras FROM authenticated, anon;
```

- [ ] **Step 2: Revisar o arquivo lendo de volta**

Confirme que: (a) só há `REVOKE SELECT (colunas)` — nenhum `REVOKE` de INSERT/UPDATE/DELETE (escritas continuam funcionando); (b) os nomes das colunas batem com o schema (`custo_unit_mao_obra`, `custo_unit_material`, `markup_mao_obra`, `markup_material`, `fee_mao_obra`, `fee_material` em `itens_orcamento`; `fee_fator`, `comissao_valor`, `imposto_valor` em `obras`); (c) revoga de `authenticated` e `anon`, não de `service_role`. Nenhuma policy de RLS referencia essas colunas (as SELECT são `USING(true)`; as write usam `get_user_papel()`), então nenhuma policy quebra.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_custos_rls_revoke.sql
git commit -m "feat: revoga SELECT das colunas financeiras de obras do papel authenticated (fecha vazamento via PostgREST direto)"
```

**NÃO aplicar a migration ainda** — a aplicação em produção acontece só na verificação final (Task 11), depois que o código server-side estiver todo migrado para o admin client, senão o app quebra entre a revogação e as correções.

---

### Task 2: `/api/obras` GET — leitura via admin + `total_venda` calculado no servidor

**Files:**
- Modify: `app/api/obras/route.ts`

**Interfaces:**
- Consumes: `createAdminClient` de `@/lib/supabase/server`; `calcularItem` de `@/lib/calculos`; `ItemOrcamento` de `@/types/database`.
- Produces: `GET /api/obras` retorna cada obra com um campo numérico `total_venda` (soma de venda calculada no servidor) e SEM o array aninhado `grupos_orcamento` de custos. Consumido por `app/(app)/obras/page.tsx` (Task 3).

- [ ] **Step 1: Reescrever o GET**

Trocar o corpo do `GET` (o `POST` do mesmo arquivo não muda) por:

```ts
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const busca = searchParams.get('busca') ?? ''
  const buscaSanitizada = busca.replace(/[(),]/g, '')
  const status = searchParams.get('status') ?? ''

  // Leitura de custos via service_role: as colunas de custo/markup foram
  // revogadas do papel authenticated (migration 016). O total de VENDA é
  // derivado no servidor e é o único valor financeiro que vai ao navegador.
  const admin = await createAdminClient()
  let query = admin
    .from('obras')
    .select(`
      id, codigo, nome, status, data_orcamento, criado_em, atualizado_em,
      clientes (id, razao_social),
      grupos_orcamento (
        itens_orcamento (
          quantidade, custo_unit_mao_obra, custo_unit_material,
          markup_mao_obra, markup_material, fee_mao_obra, fee_material
        )
      )
    `)
    .order('atualizado_em', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (buscaSanitizada) {
    query = query.or(`codigo.ilike.%${buscaSanitizada}%,nome.ilike.%${buscaSanitizada}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcula o total de venda por obra no servidor e devolve só o derivado —
  // custos crus nunca saem daqui. fee_fator não é lido na listagem, então usa-se
  // o padrão 1.02 (mesmo comportamento do cálculo de total da listagem antiga).
  const obras = (data ?? []).map(obra => {
    const itens = (obra.grupos_orcamento ?? []).flatMap(g => g.itens_orcamento ?? [])
    const total_venda = itens.reduce((soma, item) => {
      const calc = calcularItem({
        quantidade: Number(item.quantidade),
        custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
        custo_unit_material: Number(item.custo_unit_material),
        markup_mao_obra: Number(item.markup_mao_obra),
        markup_material: Number(item.markup_material),
        fee_mao_obra: item.fee_mao_obra === null || item.fee_mao_obra === undefined ? null : Number(item.fee_mao_obra),
        fee_material: item.fee_material === null || item.fee_material === undefined ? null : Number(item.fee_material),
      } as ItemOrcamento, 1.02)
      return soma + calc.total_venda
    }, 0)

    const { grupos_orcamento: _descartado, ...semItens } = obra
    return { ...semItens, total_venda }
  })

  return NextResponse.json(obras)
}
```

Trocar os imports do topo do arquivo: remover `import { mascararCamposFinanceiros } from '@/lib/permissoes/mascarar'` (não é mais usado aqui), e ajustar:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { lerJson } from '@/lib/http'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
import { calcularItem } from '@/lib/calculos'
import type { ItemOrcamento } from '@/types/database'
```

(`obterUsuarioComPermissoes`/`requirePermission` continuam usados pelo `POST`.)

- [ ] **Step 2: Type-check + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos (ignorar erros pré-existentes em `*.test.tsx` sobre globais de teste); suíte inteira passando.

- [ ] **Step 3: Commit**

```bash
git add app/api/obras/route.ts
git commit -m "feat: /api/obras calcula total_venda no servidor e não expõe custos crus"
```

---

### Task 3: `obras/page.tsx` — consumir `total_venda` do servidor

**Files:**
- Modify: `app/(app)/obras/page.tsx`

**Interfaces:**
- Consumes: `total_venda` de `GET /api/obras` (Task 2).
- Produces: nenhuma nova. A listagem passa a exibir `obra.total_venda` diretamente.

- [ ] **Step 1: Remover o cálculo client-side de custos e usar o total do servidor**

No `app/(app)/obras/page.tsx`:

1. No tipo `ObraItem`, remover o bloco `grupos_orcamento: {...}[]` e adicionar `total_venda: number`:

```ts
type ObraItem = {
  id: string
  codigo: string
  nome: string
  status: StatusObra
  data_orcamento: string | null
  clientes: { id: string; razao_social: string } | null
  total_venda: number
}
```

2. Apagar por completo a função `calcularTotalVendaObra` (linhas ~59-74) e o import de `calcularItem` (se ficar sem uso — confirmar com `grep calcularItem app/(app)/obras/page.tsx`; se não houver outro uso, remover `import { calcularItem } from '@/lib/calculos'`).

3. Na célula da tabela, trocar:

```tsx
                  <td className="px-4 py-3 text-right font-mono">
                    R$ {fmt(calcularTotalVendaObra(obra))}
                  </td>
```

por:

```tsx
                  <td className="px-4 py-3 text-right font-mono">
                    R$ {fmt(obra.total_venda)}
                  </td>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos. Se `calcularItem` ou `fmt` ficarem importados sem uso, remover o import órfão.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/obras/page.tsx"
git commit -m "feat: listagem de obras consome total_venda calculado no servidor"
```

---

### Task 4: Editor `/obras/[id]` — exigir `visualizar_custos` + ler via admin

**Files:**
- Modify: `app/(app)/obras/[id]/page.tsx`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes`, `requirePermission` de `@/lib/permissoes/servidor`; `createAdminClient` de `@/lib/supabase/server`; `redirect` de `next/navigation`.
- Produces: nenhuma nova. A página passa a redirecionar quem não tem `visualizar_custos` e a ler obra+histórico via admin.

- [ ] **Step 1: Adicionar o gate de permissão e trocar as leituras sensíveis para admin**

No `app/(app)/obras/[id]/page.tsx`:

1. Ajustar imports do topo:

```ts
import { notFound, redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes, requirePermission } from '@/lib/permissoes/servidor'
```

2. Logo no início da função `ObraPage`, antes das queries, adicionar o gate (o editor lê custos crus; só quem tem `visualizar_custos` entra):

```ts
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario || !requirePermission(usuario.permissoes, 'visualizar_custos')) {
    // O editor é uma ferramenta de custo; quem não pode ver custos não entra.
    // (Comercial exporta a planilha comercial pela listagem de obras — Task 10.)
    redirect('/obras')
  }

  const admin = await createAdminClient()
```

3. Trocar o cliente das duas leituras que puxam colunas sensíveis: a query principal da obra (o `Promise.all`, primeira posição) e a query de `itens_orcamento` do histórico. Nas duas, trocar `supabase.from(...)` por `admin.from(...)`:

- No `Promise.all`, a query `supabase.from('obras').select(...)` → `admin.from('obras').select(...)`. As outras três queries do `Promise.all` (`clientes`, `disciplinas`, `unidades_medida`) **continuam em `supabase`** (não têm colunas revogadas).
- A query `supabase.from('itens_orcamento').select('composicao_id, custo_unit_material, ...')` (linha ~108) → `admin.from('itens_orcamento').select(...)`.

Nada mais muda — quem chega aqui tem `visualizar_custos`, então a obra vai completa (sem mascaramento) para o `EditorOrcamento`, como hoje.

- [ ] **Step 2: Type-check + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte passando.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/obras/[id]/page.tsx"
git commit -m "feat: editor de obra exige visualizar_custos e lê custos via service_role"
```

---

### Task 5: `/api/obras/[id]` GET — admin + mascaramento (defensivo)

**Files:**
- Modify: `app/api/obras/[id]/route.ts`

**Interfaces:**
- Consumes: `createAdminClient` de `@/lib/supabase/server`.
- Produces: nenhuma nova. O `GET` passa a ler via admin e mascarar pela permissão do chamador. (O navegador não chama este GET hoje — só DELETE/PUT/export — mas o handler existe e faria `select('*')` que quebraria após a revogação; corrigir para não dar 500 e para não vazar se vier a ser chamado.)

- [ ] **Step 1: Trocar a leitura do GET para admin + manter o mascaramento**

No `GET` de `app/api/obras/[id]/route.ts`:

1. Ajustar import: `import { createClient, createAdminClient } from '@/lib/supabase/server'`.
2. A autenticação e o `obterUsuarioComPermissoes` continuam no cliente `supabase` (authenticated). Só a query da obra vai para admin:

```ts
  const { id } = await params

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('obras')
    .select(`
      *,
      clientes (*),
      usuarios (id, nome),
      grupos_orcamento (
        *,
        disciplinas (*),
        itens_orcamento (
          *,
          unidades_medida (*)
        )
      )
    `)
    .eq('id', id)
    .single()
```

O restante do handler (ordenação, `obterUsuarioComPermissoes`, `mascararCamposFinanceiros(data, usuario.permissoes)` no retorno) não muda — o mascaramento continua sendo a fronteira para este endpoint.

- [ ] **Step 2: Type-check + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte passando.

- [ ] **Step 3: Commit**

```bash
git add "app/api/obras/[id]/route.ts"
git commit -m "feat: GET /api/obras/[id] lê via service_role e mascara pela permissão do chamador"
```

---

### Task 6: Releitura pós-escrita dos itens → admin + mascaramento

**Files:**
- Modify: `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts` (POST)
- Modify: `app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts` (PUT)

**Interfaces:**
- Consumes: `createAdminClient` de `@/lib/supabase/server`; `mascararCamposFinanceiros` de `@/lib/permissoes/mascarar`.
- Produces: nenhuma nova. As escritas continuam no cliente `authenticated` (RLS); só a releitura (`.select()` de volta) e a resposta mudam.

**Padrão a aplicar (vale para as duas rotas):** a `INSERT`/`UPDATE` continua no cliente `supabase` (authenticated), mas retornando só o `id` (`.select('id').single()` — `id` não é coluna revogada). Depois, relê a linha completa via `admin` e mascara pela permissão do chamador antes de responder.

- [ ] **Step 1: POST de itens — releitura via admin**

Em `app/api/obras/[id]/grupos/[grupoId]/itens/route.ts`:

1. Imports: `import { createClient, createAdminClient } from '@/lib/supabase/server'` e `import { mascararCamposFinanceiros } from '@/lib/permissoes/mascarar'`.
2. No ramo `if (body.composicao_id) {...}`, trocar a `INSERT` que hoje faz `.select('*, unidades_medida(*)').single()` por retornar só o id, reler via admin e mascarar:

```ts
    const { data: inserido, error } = await supabase
      .from('itens_orcamento')
      .insert({
        grupo_id, numero, ordem,
        descricao: campos.descricao,
        unidade_id: campos.unidade_id,
        quantidade: body.quantidade,
        custo_unit_mao_obra: campos.custo_unit_mao_obra,
        custo_unit_material: campos.custo_unit_material,
        markup_mao_obra: campos.markup_mao_obra,
        markup_material: campos.markup_material,
        composicao_id: composicaoRes.data.id,
        composicao_versao: composicaoRes.data.versao,
      })
      .select('id')
      .single()

    if (error || !inserido) return NextResponse.json({ error: error?.message ?? 'Falha ao inserir item' }, { status: 500 })

    const admin = await createAdminClient()
    const { data } = await admin
      .from('itens_orcamento').select('*, unidades_medida(*)').eq('id', inserido.id).single()

    // log de uso (inalterado) ...

    return NextResponse.json(mascararCamposFinanceiros(data, usuario.permissoes), { status: 201 })
```

Manter o bloco de log de uso (`composicao_usos`) exatamente como está, entre a releitura e o `return`.

3. No ramo genérico (segundo `INSERT`, sem composição), aplicar o mesmo: `INSERT ... .select('id').single()` no cliente `supabase`, depois `admin.from('itens_orcamento').select('*, unidades_medida(*)').eq('id', inserido.id).single()`, e `return NextResponse.json(mascararCamposFinanceiros(data, usuario.permissoes), { status: 201 })`.

- [ ] **Step 2: PUT de item — releitura via admin**

Em `app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts` (PUT):

1. Imports iguais (adicionar `createAdminClient` e `mascararCamposFinanceiros`).
2. Trocar o final:

```ts
  const { error } = await supabase
    .from('itens_orcamento')
    .update(updates)
    .eq('id', itemId)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const admin = await createAdminClient()
  const { data } = await admin
    .from('itens_orcamento').select('*, unidades_medida(*)').eq('id', itemId).single()

  return NextResponse.json(mascararCamposFinanceiros(data, usuario.permissoes))
```

As resoluções de unidade por sigla (que fazem `insert/select('id')` em `unidades_medida`) não mudam — `unidades_medida` não tem colunas revogadas.

- [ ] **Step 3: Type-check + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte passando.

- [ ] **Step 4: Commit**

```bash
git add "app/api/obras/[id]/grupos/[grupoId]/itens/route.ts" "app/api/obras/[id]/grupos/[grupoId]/itens/[itemId]/route.ts"
git commit -m "feat: releitura de item pós-escrita via service_role, mascarada pela permissão do chamador"
```

---

### Task 7: Releitura de grupos/import → admin; count sem `select('*')`

**Files:**
- Modify: `app/api/obras/[id]/grupos/route.ts` (POST)
- Modify: `app/api/obras/[id]/import/route.ts` (POST — releitura final)
- Modify: `lib/excel/importar-obra.ts` (count com `select('*')` → `select('id')`)

**Interfaces:**
- Consumes: `createAdminClient` de `@/lib/supabase/server`; `mascararCamposFinanceiros` de `@/lib/permissoes/mascarar`.
- Produces: nenhuma nova.

- [ ] **Step 1: POST de grupos — releitura via admin**

Em `app/api/obras/[id]/grupos/route.ts`, a `INSERT` do grupo faz `.select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))').single()` — o join de `itens_orcamento(*)` traz colunas revogadas. Trocar para retornar só o id no cliente `supabase`, reler via admin e mascarar:

```ts
  const { data: grupoInserido, error } = await supabase
    .from('grupos_orcamento')
    .insert({ obra_id, disciplina_id, letra, ordem })
    .select('id')
    .single()

  if (error || !grupoInserido) return NextResponse.json({ error: error?.message ?? 'Falha ao criar grupo' }, { status: 500 })

  const admin = await createAdminClient()
  const { data } = await admin
    .from('grupos_orcamento')
    .select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')
    .eq('id', grupoInserido.id)
    .single()

  return NextResponse.json(mascararCamposFinanceiros(data, usuario.permissoes), { status: 201 })
```

Adicionar os imports `createAdminClient` e `mascararCamposFinanceiros`. (Um grupo recém-criado não tem itens ainda, mas o join precisa ser legível — daí o admin.)

- [ ] **Step 2: Releitura final do import via admin**

Em `app/api/obras/[id]/import/route.ts`, a releitura final `supabase.from('grupos_orcamento').select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')` traz colunas revogadas. Trocar para admin e mascarar a resposta:

1. Imports: adicionar `createAdminClient` e `mascararCamposFinanceiros`.
2. Trocar:

```ts
  const admin = await createAdminClient()
  const { data: grupos } = await admin
    .from('grupos_orcamento')
    .select('*, disciplinas(*), itens_orcamento(*, unidades_medida(*))')
    .eq('obra_id', obra_id)
    .order('ordem')

  return NextResponse.json(
    { grupos: mascararCamposFinanceiros(grupos ?? [], usuario.permissoes), disciplinas: resultado.disciplinas, itens: resultado.itens },
    { status: 201 }
  )
```

(Quem importa tem `importar_planilhas`; mascarar é defesa em profundidade para o caso de override sem `visualizar_custos`.)

- [ ] **Step 3: Count de itens sem `select('*')` no importar-obra**

Em `lib/excel/importar-obra.ts`, a contagem `supabase.from('itens_orcamento').select('*', { count: 'exact', head: true })` expande `*` para colunas revogadas. Como roda no cliente `authenticated` (a função recebe o client das rotas de import, que usam `supabase`), trocar por uma coluna não sensível:

```ts
      .from('itens_orcamento')
      .select('id', { count: 'exact', head: true })
```

O `INSERT` de itens (linha ~114) **não** tem `.select()` de volta, então continua funcionando no cliente authenticated (INSERT não foi revogado). Não mudar.

- [ ] **Step 4: Type-check + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte passando.

- [ ] **Step 5: Commit**

```bash
git add "app/api/obras/[id]/grupos/route.ts" "app/api/obras/[id]/import/route.ts" lib/excel/importar-obra.ts
git commit -m "feat: releitura de grupos/import via service_role e count de itens sem coluna sensível"
```

---

### Task 8: Dashboard (página + export) → leitura via admin

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/api/dashboard/export/route.ts`

**Interfaces:**
- Consumes: `createAdminClient` de `@/lib/supabase/server`.
- Produces: nenhuma nova. As duas leituras de obras com custos passam a usar admin; o dashboard continua enviando só agregados ao navegador.

- [ ] **Step 1: `dashboard/page.tsx` — obras via admin**

Em `app/(app)/dashboard/page.tsx`:

1. Import: `import { createClient, createAdminClient } from '@/lib/supabase/server'`.
2. Antes do `Promise.all`, criar `const admin = await createAdminClient()`.
3. Na `obrasQuery` (`supabase.from('obras').select(...)` com colunas de custo), trocar `supabase` por `admin`. As outras queries do `Promise.all` (`usuarios`, `historico_alteracoes`, `clientes`) **continuam em `supabase`**. O cálculo (`calcularDashboard`) e o que vai ao navegador (KPIs/indicadores agregados) não mudam.

- [ ] **Step 2: `/api/dashboard/export` — obras via admin**

Em `app/api/dashboard/export/route.ts`: a autenticação e o `obterUsuarioComPermissoes` (gate `visualizar_indicadores`) continuam no `supabase`; só a query `supabase.from('obras').select(...)` (com colunas de custo) vira `admin.from('obras').select(...)`. Adicionar `createAdminClient` ao import e `const admin = await createAdminClient()` após o gate.

- [ ] **Step 3: Type-check + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte passando.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" app/api/dashboard/export/route.ts
git commit -m "feat: dashboard e export de indicadores leem obras via service_role"
```

---

### Task 9: `/api/obras/[id]/export` → leitura via admin

**Files:**
- Modify: `app/api/obras/[id]/export/route.ts`

**Interfaces:**
- Consumes: `createAdminClient` de `@/lib/supabase/server`.
- Produces: nenhuma nova. Mantém os gates (`exportar_planilhas`; `visualizar_custos` para `tipo=tecnico`); só a leitura da obra vira admin. Isto sustenta a exportação comercial (Task 10), que o comercial dispara sem entrar no editor.

- [ ] **Step 1: Trocar a leitura da obra para admin**

Em `app/api/obras/[id]/export/route.ts`: manter todo o bloco de autenticação + gates (`obterUsuarioComPermissoes`, `requirePermission('exportar_planilhas')`, e o gate extra `visualizar_custos` para `tipo === 'tecnico'`) no cliente `supabase`. Trocar só a query `supabase.from('obras').select(...)` (que puxa `fee_fator`, `comissao_valor`, `imposto_valor` e as colunas de item) por `admin.from('obras').select(...)`. Adicionar `createAdminClient` ao import e criar `const admin = await createAdminClient()` após os gates. O cálculo de venda (`calcularItem`) e a montagem das planilhas não mudam — o export técnico já era barrado para quem não tem `visualizar_custos`, e o comercial só grava preços de venda.

- [ ] **Step 2: Type-check + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte passando.

- [ ] **Step 3: Commit**

```bash
git add "app/api/obras/[id]/export/route.ts"
git commit -m "feat: export de obra lê via service_role mantendo os gates de permissão"
```

---

### Task 10: Exportação comercial na listagem de obras

**Files:**
- Modify: `app/api/usuarios/me/route.ts`
- Modify: `app/(app)/obras/page.tsx`

**Interfaces:**
- Consumes: `obterUsuarioComPermissoes` de `@/lib/permissoes/servidor` (no `me`).
- Produces: `GET /api/usuarios/me` passa a incluir `permissoes: string[]` (permissões efetivas). A listagem de obras ganha um botão de "Exportar comercial" por linha, visível a quem tem `exportar_planilhas`.

- [ ] **Step 1: `/api/usuarios/me` retorna as permissões efetivas**

Em `app/api/usuarios/me/route.ts`, trocar a leitura direta de `usuarios` por `obterUsuarioComPermissoes` e devolver as permissões:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterUsuarioComPermissoes } from '@/lib/permissoes/servidor'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const usuario = await obterUsuarioComPermissoes(supabase, user.id)
  if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  return NextResponse.json({
    id: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel,
    permissoes: Array.from(usuario.permissoes),
  })
}
```

- [ ] **Step 2: Botão "Exportar comercial" na listagem**

Em `app/(app)/obras/page.tsx`:

1. Adicionar estado para permissões e derivar `podeExportar`:

```ts
  const [permissoes, setPermissoes] = useState<Set<string>>(new Set())
```

No `useEffect` de montagem que já busca `/api/usuarios/me`, guardar também as permissões:

```ts
    fetch('/api/usuarios/me')
      .then(r => (r.ok ? r.json() : null))
      .then(u => {
        setEhAdmin(u?.papel === 'admin')
        setPermissoes(new Set(u?.permissoes ?? []))
      })
      .catch(() => {})
```

2. Adicionar a função de download (dispara o GET de export comercial, que já é gateado no servidor):

```ts
  function exportarComercial(e: React.MouseEvent, obra: ObraItem) {
    e.stopPropagation()
    window.location.href = `/api/obras/${obra.id}/export?tipo=comercial`
  }
```

3. Mostrar uma coluna de ações quando o usuário puder exportar OU for admin. Trocar a condição do cabeçalho e da célula de `{ehAdmin && ...}` por uma que também cubra exportação. No `<thead>`:

```tsx
                {(ehAdmin || permissoes.has('exportar_planilhas')) && (
                  <th className="px-4 py-3 font-medium text-center w-28">Ações</th>
                )}
```

E a célula de ações (trocar o bloco `{ehAdmin && (<td>...</td>)}`) por uma que renderiza o botão de export para quem tem `exportar_planilhas` e o de excluir para admin:

```tsx
                  {(ehAdmin || permissoes.has('exportar_planilhas')) && (
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        {permissoes.has('exportar_planilhas') && (
                          <button
                            type="button"
                            aria-label={`Exportar planilha comercial de ${obra.codigo}`}
                            title="Exportar comercial"
                            onClick={e => exportarComercial(e, obra)}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <FileDown className="size-4" />
                          </button>
                        )}
                        {ehAdmin && (
                          <button
                            type="button"
                            aria-label={`Excluir orçamento ${obra.codigo}`}
                            title="Excluir orçamento"
                            onClick={e => { e.stopPropagation(); setExcluindo(obra) }}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
```

4. Adicionar `FileDown` ao import de `lucide-react` (junto de `Trash2`).

- [ ] **Step 3: Type-check + suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros novos; suíte passando.

- [ ] **Step 4: Commit**

```bash
git add app/api/usuarios/me/route.ts "app/(app)/obras/page.tsx"
git commit -m "feat: exportação comercial na listagem de obras para quem tem exportar_planilhas"
```

---

### Task 11: Verificação final — build, suíte e round-trip ao centavo

**Files:** nenhum (só validação).

- [ ] **Step 1: Suíte completa + type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: suíte inteira passando; sem erros de tipo novos (fora dos pré-existentes em `*.test.tsx`).

- [ ] **Step 2: Grep de sanidade — nenhuma leitura sensível sobrou no cliente authenticated**

Run (do diretório do worktree):
```bash
grep -rn "supabase\.from('obras')\|supabase\.from('itens_orcamento')\|supabase\.from('grupos_orcamento')" app/ --include="*.ts" --include="*.tsx" | grep -i "select"
```
Revisar cada resultado à mão: toda query que seleciona colunas sensíveis (custo/markup/fee, ou `select('*')`, ou joins `itens_orcamento(*)`/`grupos_orcamento(*)`) deve estar em `admin.from(...)`, não `supabase.from(...)`. Leituras de colunas não sensíveis (ex.: `select('id')`, count, `composicao_versao`) podem seguir em `supabase`. Escritas (`insert`/`update`/`delete`) seguem em `supabase`.

- [ ] **Step 3: Build de produção**

Precisa de `.env.local` no worktree (arquivo git-ignored, não vem no worktree). Copiar do repo principal só para o build local e remover depois:
```bash
cp ../../.env.local .env.local
npm run build
rm .env.local
```
Expected: build conclui sem erros; rota `/obras` e as de API presentes.

- [ ] **Step 4: Aplicar a migration 016 em produção (com confirmação do usuário)**

**PARAR e confirmar com o usuário antes de aplicar** — mexe no banco de produção. Depois de confirmado, aplicar `supabase/migrations/016_custos_rls_revoke.sql` no Supabase. A ordem importa: o código server-side já está todo migrado para o admin client (Tasks 2–10), então aplicar a revogação agora não quebra o app.

- [ ] **Step 5: Round-trip ao centavo (manual, com o usuário)**

Com a migration aplicada e `npm run dev` rodando: exportar a planilha técnica de uma obra real conhecida (ex.: a de referência "mykonos", total 5.957.042,03) como um usuário com `visualizar_custos`, e confirmar que o total bate exatamente com o baseline pré-mudança (o motor de cálculo não foi tocado, então deve bater ao centavo). Em seguida, logar/simular um usuário sem `visualizar_custos` (comercial) e confirmar: (a) é redirecionado ao abrir uma obra; (b) consegue exportar a planilha comercial pela listagem; (c) no DevTools, `supabase.from('itens_orcamento').select('custo_unit_material')` retorna erro de permissão (a revogação está ativa).
