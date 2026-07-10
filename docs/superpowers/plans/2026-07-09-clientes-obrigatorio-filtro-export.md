# Cliente Obrigatório, Filtro no Dashboard e Fidelidade do Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Tornar `cliente_id` obrigatório em `obras`, fechando o gap entre o tipo TS já declarado como obrigatório e o schema/API que hoje aceitam nulo; (2) adicionar filtro por cliente no dashboard, recalculando todos os KPIs/gráficos a partir do mesmo pipeline existente; (3) preparar `lib/format.ts` com arredondamento explícito para eliminar divergência entre o valor exibido na tela e o exportado; (4) deixar o export Excel pronto para clonar o template real da empresa assim que os arquivos `.xlsx` forem entregues.

**Architecture:** Nenhum hub novo é criado. `Clientes` (hoje isolado, 0 edges cruzados no grafo) ganha sua primeira ligação real com `Obras` ao tornar a FK obrigatória — mas é um aperto de constraint, não uma tabela/relação nova. O filtro do dashboard entra **antes** de `calcularDashboard()` em `app/(app)/dashboard/page.tsx`; como todo KPI/gráfico já consome o único objeto `dados` retornado por essa função, nenhum arquivo em `lib/dashboard/metricas.ts` ou `components/dashboard/*` precisa mudar. O export Excel continua consumindo `lib/calculos.ts` sem alterar sua assinatura.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (PostgreSQL), exceljs, Vitest.

**Spec:** análise do grafo Graphify + leitura direta de `types/database.ts`, `supabase/migrations/*`, `app/api/obras/*`, `app/(app)/dashboard/page.tsx`, `lib/calculos.ts`, `lib/format.ts`, `app/api/obras/[id]/export/route.ts` (registrada na conversa desta sessão).

## Global Constraints

- Todo texto de UI em português brasileiro.
- TypeScript strict; alias `@/*`.
- **Nenhuma fórmula duplicada** — cálculo monetário só em `lib/calculos.ts`; formatação/arredondamento só em `lib/format.ts`.
- Manter a decisão já tomada: `Cliente` continua com `razao_social`/`cnpj`/`endereco` (não simplificar para `nome` único — mudança destrutiva descartada).
- Migrations neste projeto são executadas manualmente: colar o SQL no painel Supabase → SQL Editor e confirmar "Success. No rows returned" (não há CLI de migration configurada).
- Commits em português no padrão `feat:`/`fix:`/`test:`.
- Testes automatizados neste repo só existem para funções puras em `lib/*` (ver `lib/calculos.test.ts`, `lib/dashboard/metricas.test.ts`, `lib/dashboard/periodo.test.ts`). Rotas de API e páginas não têm suíte própria — verificação é manual via `npm run dev`. Este plano segue o mesmo padrão: TDD nas Tasks que tocam `lib/*`, verificação manual nas que tocam rotas/páginas.
- Rodar testes com `npm run test:run` (vitest, modo não-interativo).

---

## Trilha A — Feature 1: Cliente obrigatório em Obras

### Task 1 (Trilha A): Verificar dados existentes e criar migration

**Files:**
- Create: `supabase/migrations/007_cliente_obrigatorio.sql`

**Interfaces:**
- Produces: `obras.cliente_id` com constraint `NOT NULL`.

- [ ] **Step 1: Checar se existem obras sem cliente**

No painel Supabase → SQL Editor, rodar:

```sql
SELECT id, codigo, nome FROM obras WHERE cliente_id IS NULL;
```

Se retornar 0 linhas, seguir para o Step 2. **Se retornar alguma linha, parar aqui** — essas obras precisam de um `cliente_id` real atribuído manualmente (não inventar um cliente placeholder) antes de aplicar a constraint. Reportar as obras encontradas antes de continuar.

- [ ] **Step 2: Criar `supabase/migrations/007_cliente_obrigatorio.sql`**

```sql
-- 007_cliente_obrigatorio.sql
-- Toda obra passa a exigir um cliente vinculado (fecha o gap entre o tipo
-- TS já declarado obrigatório em types/database.ts e o schema, que hoje
-- aceita NULL).

ALTER TABLE obras
  ALTER COLUMN cliente_id SET NOT NULL;
```

- [ ] **Step 3: Executar no Supabase**

Colar o conteúdo do arquivo no SQL Editor e executar. Esperado: "Success. No rows returned". Conferir em Table Editor → `obras` → coluna `cliente_id` sem o ícone de "nullable".

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_cliente_obrigatorio.sql
git commit -m "feat: cliente_id obrigatório em obras"
```

---

### Task 2 (Trilha A): Validação obrigatória nas rotas de API

**Files:**
- Modify: `app/api/obras/route.ts:52-56` (POST)
- Modify: `app/api/obras/[id]/route.ts:62-66` (PUT)

**Interfaces:**
- Consumes: nenhuma interface nova — mesmo corpo de request já aceito hoje.
- Produces: resposta `400 { error: 'Cliente é obrigatório' }` quando `cliente_id` ausente/vazio.

- [ ] **Step 1: Validar em `app/api/obras/route.ts` (POST)**

Em `app/api/obras/route.ts`, substituir o bloco de validação (linhas 54-56):

```typescript
  if (!codigo?.trim() || !nome?.trim()) {
    return NextResponse.json({ error: 'Código e nome são obrigatórios' }, { status: 400 })
  }
```

por:

```typescript
  if (!codigo?.trim() || !nome?.trim()) {
    return NextResponse.json({ error: 'Código e nome são obrigatórios' }, { status: 400 })
  }
  if (!cliente_id?.trim()) {
    return NextResponse.json({ error: 'Cliente é obrigatório' }, { status: 400 })
  }
```

E trocar `cliente_id: cliente_id ?? null,` (linha 63) por `cliente_id: cliente_id.trim(),` no `insert`.

- [ ] **Step 2: Validar em `app/api/obras/[id]/route.ts` (PUT)**

No handler `PUT`, após a linha `if (!body) return ...` (linha 59), adicionar antes do loop de campos permitidos:

```typescript
  if ('cliente_id' in body && !body.cliente_id) {
    return NextResponse.json({ error: 'Cliente é obrigatório' }, { status: 400 })
  }
```

- [ ] **Step 3: Verificação manual**

Rodar `npm run dev`. Com um cliente de teste em cadastro, chamar:

```bash
curl -X POST http://localhost:3000/api/obras -H "Content-Type: application/json" -d "{\"codigo\":\"TEST\",\"nome\":\"Teste\",\"cliente_id\":\"\"}"
```

Esperado: `400` com `{"error":"Cliente é obrigatório"}`. Repetir com um `cliente_id` válido — esperado `201`.

- [ ] **Step 4: Commit**

```bash
git add app/api/obras/route.ts "app/api/obras/[id]/route.ts"
git commit -m "feat: validar cliente obrigatório nas rotas de obras"
```

---

### Task 3 (Trilha A): Campo obrigatório na UI (criação e edição de obra)

**Files:**
- Modify: `app/(app)/obras/page.tsx:141-144` (validação em `criarObra`), `app/(app)/obras/page.tsx:~325` (select), `app/(app)/obras/page.tsx:~348` (botão)
- Modify: `components/orcamento/CabecalhoObra.tsx:51-60` (`salvar`), `components/orcamento/CabecalhoObra.tsx:84-96` (select)

**Interfaces:**
- Consumes: `POST /api/obras` e `PUT /api/obras/:id` já retornam 400 com `cliente_id` ausente (Task 2).

- [ ] **Step 1: Validação no diálogo de nova obra**

Em `app/(app)/obras/page.tsx`, função `criarObra`, trocar:

```typescript
  async function criarObra() {
    if (!novaObra.codigo.trim() || !novaObra.nome.trim()) {
      setErro('Código e nome são obrigatórios')
      return
    }
```

por:

```typescript
  async function criarObra() {
    if (!novaObra.codigo.trim() || !novaObra.nome.trim()) {
      setErro('Código e nome são obrigatórios')
      return
    }
    if (!novaObra.cliente_id) {
      setErro('Selecione um cliente')
      return
    }
```

- [ ] **Step 2: Remover a opção "Nenhum (opcional)" do select de cliente**

No mesmo arquivo, no bloco do `NativeSelect` de cliente (label "Cliente"):

```tsx
              <NativeSelect
                id="cliente"
                value={novaObra.cliente_id}
                onChange={e => setNovaObra(prev => ({ ...prev, cliente_id: e.target.value }))}
              >
                <option value="">Nenhum (opcional)</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.razao_social}</option>
                ))}
              </NativeSelect>
```

trocar o rótulo acima do select de `Cliente` para `Cliente *` e a option vazia para um placeholder desabilitado:

```tsx
              <NativeSelect
                id="cliente"
                required
                value={novaObra.cliente_id}
                onChange={e => setNovaObra(prev => ({ ...prev, cliente_id: e.target.value }))}
              >
                <option value="" disabled>Selecione...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.razao_social}</option>
                ))}
              </NativeSelect>
```

(atualizar também o `<Label htmlFor="cliente">Cliente</Label>` logo acima para `Cliente *`)

- [ ] **Step 3: Desabilitar o botão "Criar obra" sem cliente selecionado**

Trocar:

```tsx
            <Button onClick={criarObra} disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar obra'}
            </Button>
```

por:

```tsx
            <Button onClick={criarObra} disabled={salvando || !novaObra.cliente_id}>
              {salvando ? 'Criando...' : 'Criar obra'}
            </Button>
```

- [ ] **Step 4: Impedir limpar o cliente no cabeçalho da obra**

Em `components/orcamento/CabecalhoObra.tsx`, o `NativeSelect` de cliente:

```tsx
          <NativeSelect
            value={campos.cliente_id}
            onChange={e => {
              const v = e.target.value
              setCampos(p => ({ ...p, cliente_id: v }))
              salvar('cliente_id', v || null)
            }}
          >
            <option value="">Nenhum</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.razao_social}</option>
            ))}
          </NativeSelect>
```

trocar para remover a opção "Nenhum" e só salvar quando houver valor:

```tsx
          <NativeSelect
            required
            value={campos.cliente_id}
            onChange={e => {
              const v = e.target.value
              setCampos(p => ({ ...p, cliente_id: v }))
              if (v) salvar('cliente_id', v)
            }}
          >
            <option value="" disabled>Selecione...</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.razao_social}</option>
            ))}
          </NativeSelect>
```

- [ ] **Step 5: Verificação manual**

Rodar `npm run dev`. Em `/obras`, clicar "+ Novo Orçamento": confirmar que o botão "Criar obra" fica desabilitado até selecionar um cliente. Abrir uma obra existente em `/obras/[id]` e confirmar que o select de cliente não tem mais a opção "Nenhum".

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/obras/page.tsx" components/orcamento/CabecalhoObra.tsx
git commit -m "feat: exigir cliente na criação e edição de obra"
```

---

## Trilha B — Feature 2: Filtro de cliente no Dashboard

### Task 4 (Trilha B): Query param + filtro na query + dropdown

**Files:**
- Modify: `app/(app)/dashboard/page.tsx:17-24, 29-41`
- Modify: `components/dashboard/HeaderDashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/clientes` (já existe, retorna `{ id, razao_social, cnpj, endereco, criado_em }[]`).
- Produces: nenhuma interface nova exposta a outros módulos — o filtro fica contido nestes dois arquivos.

- [ ] **Step 1: Adicionar `cliente` ao tipo de `searchParams` e aplicar o filtro na query**

Em `app/(app)/dashboard/page.tsx`, trocar:

```typescript
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; busca?: string }>
}) {
  const params = await searchParams
  const periodo = parsePeriodo(params.periodo)
  const intervalo = intervaloDoPeriodo(periodo)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: usuario }, { data: obras, error: erroObras }, { data: historico }] = await Promise.all([
    supabase.from('usuarios').select('nome, papel').eq('id', user!.id).single(),
    supabase.from('obras').select(`
      id, codigo, nome, status, data_orcamento, criado_em,
      clientes ( id, razao_social ),
      usuarios ( nome ),
      grupos_orcamento (
        itens_orcamento (
          quantidade, custo_unit_mao_obra, custo_unit_material,
          markup_mao_obra, markup_material
        )
      )
    `),
```

por:

```typescript
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; busca?: string; cliente?: string }>
}) {
  const params = await searchParams
  const periodo = parsePeriodo(params.periodo)
  const intervalo = intervaloDoPeriodo(periodo)
  const clienteId = params.cliente?.trim() || null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let obrasQuery = supabase.from('obras').select(`
      id, codigo, nome, status, data_orcamento, criado_em,
      clientes ( id, razao_social ),
      usuarios ( nome ),
      grupos_orcamento (
        itens_orcamento (
          quantidade, custo_unit_mao_obra, custo_unit_material,
          markup_mao_obra, markup_material
        )
      )
    `)
  if (clienteId) obrasQuery = obrasQuery.eq('cliente_id', clienteId)

  const [{ data: usuario }, { data: obras, error: erroObras }, { data: historico }, { data: listaClientes }] = await Promise.all([
    supabase.from('usuarios').select('nome, papel').eq('id', user!.id).single(),
    obrasQuery,
```

- [ ] **Step 2: Buscar a lista de clientes para o dropdown e adicioná-la ao `Promise.all`**

Continuando no mesmo `Promise.all` (depois do array de `historico_alteracoes` já existente), adicionar como último elemento:

```typescript
    supabase.from('clientes').select('id, razao_social').order('razao_social'),
```

- [ ] **Step 3: Passar a lista de clientes e o cliente selecionado para `HeaderDashboard`**

Trocar:

```tsx
      <HeaderDashboard periodo={periodo} usuario={{ nome: usuario?.nome ?? 'Usuário' }} />
```

por:

```tsx
      <HeaderDashboard
        periodo={periodo}
        usuario={{ nome: usuario?.nome ?? 'Usuário' }}
        clientes={listaClientes ?? []}
        clienteSelecionado={clienteId}
      />
```

- [ ] **Step 4: Adicionar o dropdown de cliente em `HeaderDashboard.tsx`**

Trocar a assinatura da função:

```typescript
export function HeaderDashboard({ periodo, usuario }: { periodo: PeriodoKey; usuario: { nome: string } }) {
```

por:

```typescript
export function HeaderDashboard({
  periodo, usuario, clientes, clienteSelecionado,
}: {
  periodo: PeriodoKey
  usuario: { nome: string }
  clientes: { id: string; razao_social: string }[]
  clienteSelecionado: string | null
}) {
```

Adicionar a função de troca (ao lado de `mudarPeriodo`):

```typescript
  function mudarCliente(novo: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (novo) params.set('cliente', novo)
    else params.delete('cliente')
    router.push(`/dashboard?${params.toString()}`)
  }
```

Adicionar o `<Select>` de cliente logo após o `<Select>` de período existente (mesmo padrão de componente):

```tsx
      <Select value={clienteSelecionado ?? ''} onValueChange={mudarCliente}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Todos os clientes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Todos os clientes</SelectItem>
          {clientes.map(c => (
            <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
          ))}
        </SelectContent>
      </Select>
```

- [ ] **Step 5: Verificação manual**

Rodar `npm run dev`. Abrir `/dashboard`, selecionar um cliente no novo dropdown e confirmar: (a) a URL ganha `?cliente=<id>`, (b) todos os 6 KPIs, os 4 gráficos, "Últimos Orçamentos" e "Top Clientes" mudam para refletir só as obras daquele cliente, (c) voltar para "Todos os clientes" restaura os valores originais.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" components/dashboard/HeaderDashboard.tsx
git commit -m "feat: filtro de cliente no dashboard"
```

---

## Trilha C — Feature 4a: Arredondamento consistente (pré-requisito para o export)

### Task 5 (Trilha C): `round2()` em `lib/format.ts` com TDD

**Files:**
- Modify: `lib/format.ts`
- Test: `lib/format.test.ts` (novo)

**Interfaces:**
- Produces: `round2(n: number): number` — arredonda para 2 casas decimais, half-away-from-zero, usado tanto por `fmt()` quanto pelo export Excel (Trilha D).

- [ ] **Step 1: Escrever o teste (deve falhar)**

Criar `lib/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { round2 } from './format'

describe('round2', () => {
  it('arredonda para cima em .xx5', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
  })

  it('mantém valores já com 2 casas', () => {
    expect(round2(10.5)).toBe(10.5)
    expect(round2(0)).toBe(0)
  })

  it('arredonda negativos para longe do zero', () => {
    expect(round2(-1.005)).toBe(-1.01)
  })

  it('corrige erro de ponto flutuante típico do JS', () => {
    // 1.005 em IEEE-754 é armazenado como ~1.00499999999999989...
    // Math.round ingênuo arredondaria para 1.00; round2 deve compensar.
    expect(round2(1.115)).toBe(1.12)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm run test:run -- lib/format.test.ts`
Expected: FAIL — `round2` não exportado por `./format`.

- [ ] **Step 3: Implementar `round2` em `lib/format.ts`**

Adicionar ao arquivo (antes de `fmt`):

```typescript
export function round2(n: number): number {
  const fator = 100
  // Compensa erro de representação binária (ex.: 1.005 → 1.00499...)
  // antes de arredondar, para que .xx5 sempre suba.
  return Math.sign(n) * Math.round((Math.abs(n) * fator) + Number.EPSILON * fator) / fator
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm run test:run -- lib/format.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts lib/format.test.ts
git commit -m "feat: round2 para arredondamento consistente entre tela e export"
```

---

## Trilha D — Feature 3 + 4b: Export Excel fiel ao template

### Achados da inspeção real dos templates (2026-07-09)

`templates/orcamento-comercial.xlsx` e `templates/orcamento-tecnico.xlsx` foram recebidos e inspecionados célula a célula com ExcelJS. **Achado importante:** os dois arquivos são byte-idênticos (mesmo MD5) — não existe hoje uma variante comercial sem colunas de custo. O usuário confirmou explicitamente para usar os dois arquivos como estão. Consequência: por ora as duas saídas (`tipo=comercial` e `tipo=tecnico`) renderizam o **mesmo layout** — um `lib/excel/export-template.ts` único é reaproveitado para os dois tipos. Se uma variante comercial distinta chegar depois, criar um segundo gerador nesse momento.

O template é uma **planilha real preenchida** (obra "08114 UNILEVER - WT"), não um arquivo em branco com placeholders — por isso a Task 6 não faz `workbook.xlsx.readFile()` + popular células fixas; ela **replica exatamente o padrão de estilo observado** (fonte, bordas, preenchimento, formatos numéricos, merges, fórmulas, largura de colunas, congelamento de painel) gerando as linhas dinamicamente por obra, igual ao approach já usado em `app/api/obras/[id]/export/route.ts` hoje — só que com fidelidade visual exata ao invés de estilo aproximado.

Estrutura confirmada (única aba, nome `"."`, 15 colunas A–O):
- **Linhas 1–5:** cabeçalho solto (não é grade) — C1 título, L1 `=TODAY()`, C2 razão social do cliente, C3 `ENDEREÇO: ...`, C4 `CNPJ: ...`, C5 `{codigo} {nome}`. Fonte Calibri 9 negrito em toda a linha.
- **Linha 6:** totais gerais — fórmulas `=SUM(J9:J{ultima})/2`, `=SUM(K9:K{ultima})/2`, `=SUM(L9:L{ultima})/2` (a divisão por 2 compensa o fato de a faixa somada incluir tanto as linhas de grupo quanto as linhas de item, e grupo = soma dos seus itens).
- **Linha 7:** cabeçalhos mesclados — `H7:I7`="PREÇOS UNITÁRIOS", `J7:K7`="SUB TOTAL", `L7`="TOTAL" (merge apenas nas duas primeiras).
- **Linha 8:** cabeçalho de colunas — ITEM, Nº, DESCRIÇÃO, DISCIPLINA, LOCAL, UN., QT., M. OBRA, MATERIAL, M. OBRA, MATERIAL, TOTAL, OBS., OBS. (as duas últimas mapeiam para `observacao`/`observacao_2` do item).
- **Linhas 9+:** um bloco por grupo — 1 linha de grupo (negrito, fundo cinza sólido, fórmulas `SUM` sobre a faixa de itens do grupo) seguida das linhas de item (peso normal, sem preenchimento, fórmulas `H*G`, `I*G`, `J+K`). **Não há linha de totais no rodapé** — o total geral já vive na linha 6, calculado por fórmula dinâmica.
- Painel congelado em `A9` (`ySplit: 8`), grade oculta (`showGridLines: false`), AutoFilter `A8:N{última linha}`.
- Bordas "hair" (fininhas) em toda a grade de dados (linhas 6–última), cor `{theme:0, tint:-0.14996795556505021}`.
- Formato de moeda contábil `_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-` nas colunas H,I,J,K,L. Quantidade (G) em `0.00`.
- Larguras de coluna exatas (A→O): `5.796875, 4.3984375, 72.3984375, 11.59765625, 13.59765625, 5.09765625, 4.796875, 9.19921875, 10, 9.19921875, 10, 8.09765625, 11.59765625, 30.69921875, 0.5`.
- Sem conditional formatting, sem data validation (confirmado — `ws.conditionalFormattings` e `ws.dataValidations.model` vazios em ambos os arquivos).
- **Nota sobre `round2`:** este layout usa fórmulas Excel vivas (`H*G`, `SUM`, etc.) em vez de valores pré-computados — o Excel calcula com a mesma precisão IEEE-754 que o JS, a partir dos mesmos valores brutos (`custo_unit_mao_obra`/`custo_unit_material`/`quantidade`, vindos direto do banco). A consistência de arredondamento vem da arquitetura (mesma fonte, mesmo `numFmt` de exibição em 2 casas), não de aplicar `round2()` sobre uma fórmula — `round2()` de Task 5 não se aplica a esta task e permanece não conectado, como já registrado no review final da Trilha A/B/C.

### Task 6 (Trilha D): `lib/excel/export-template.ts` — gerador fiel ao template

**Files:**
- Create: `lib/excel/export-template.ts`
- Test: `lib/excel/export-template.test.ts`

**Interfaces:**
- Produces: `montarPlanilhaDescritivo(obra: ObraCabecalho, grupos: GrupoComItens[]): ExcelJS.Workbook` — usada por Task 7 tanto para `tipo=comercial` quanto `tipo=tecnico` (mesmo layout, ver achados acima).

- [ ] **Step 1: Escrever o teste (deve falhar)**

Criar `lib/excel/export-template.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { montarPlanilhaDescritivo } from './export-template'

const obra = {
  codigo: '08114',
  nome: 'UNILEVER - WT',
  cliente: { razao_social: 'UNILEVER DO BRASIL', endereco: 'AV. TESTE, 123', cnpj: '61.068.276/0001-04' },
}

const grupos = [
  {
    letra: 'A',
    ordem: 1,
    disciplina_nome: 'pré-obra',
    itens: [
      {
        numero: 1, descricao: 'DEMOLIÇÃO DE FORRO MINERAL', local: '4B - SALA HC OFFICE',
        unidade_sigla: 'M2', quantidade: 23, custo_unit_mao_obra: 90.678, custo_unit_material: 0,
        observacao: 'EXECUTADO', observacao_2: 'ABSORVER',
      },
      {
        numero: 2, descricao: 'DEMOLIÇÃO DE FORRO MINERAL', local: '4B - SALA CONFORT',
        unidade_sigla: 'M2', quantidade: 16, custo_unit_mao_obra: 90.678, custo_unit_material: 0,
        observacao: 'EXECUTADO', observacao_2: 'ABSORVER',
      },
    ],
  },
]

describe('montarPlanilhaDescritivo', () => {
  it('escreve o cabeçalho solto (linhas 1-5) com os dados da obra', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.getCell('C1').value).toBe('DESCRITIVO TÉCNICO E COMERCIAL')
    expect(ws.getCell('C2').value).toBe('UNILEVER DO BRASIL')
    expect(ws.getCell('C3').value).toBe('ENDEREÇO:  AV. TESTE, 123')
    expect(ws.getCell('C4').value).toBe('CNPJ: 61.068.276/0001-04')
    expect(ws.getCell('C5').value).toBe('08114 UNILEVER - WT')
  })

  it('mescla os cabeçalhos agrupados da linha 7', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    const merges = ws.model.merges as string[]
    expect(merges).toContain('H7:I7')
    expect(merges).toContain('J7:K7')
    expect(ws.getCell('H7').value).toBe('PREÇOS UNITÁRIOS')
    expect(ws.getCell('L7').value).toBe('TOTAL')
  })

  it('escreve o cabeçalho de colunas na linha 8', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.getCell('A8').value).toBe('ITEM')
    expect(ws.getCell('M8').value).toBe('OBS.')
    expect(ws.getCell('N8').value).toBe('OBS.')
  })

  it('escreve a linha de grupo em negrito com fundo cinza e fórmulas SUM sobre os itens', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    const grupoRow = ws.getRow(9)
    expect(grupoRow.getCell(1).value).toBe('A')
    expect(grupoRow.getCell(3).value).toBe('PRÉ-OBRA')
    expect(grupoRow.getCell(1).font?.bold).toBe(true)
    expect(grupoRow.getCell(1).fill).toMatchObject({ pattern: 'solid' })
    expect(grupoRow.getCell(10).value).toMatchObject({ formula: 'SUM(J10:J11)' })
  })

  it('escreve as linhas de item com fórmulas H*G, I*G, J+K e sem preenchimento', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    const item1 = ws.getRow(10)
    expect(item1.getCell(2).value).toBe(1)
    expect(item1.getCell(3).value).toBe('DEMOLIÇÃO DE FORRO MINERAL')
    expect(item1.getCell(8).value).toBe(90.678)
    expect(item1.getCell(10).value).toMatchObject({ formula: 'H10*G10' })
    expect(item1.getCell(11).value).toMatchObject({ formula: 'I10*G10' })
    expect(item1.getCell(12).value).toMatchObject({ formula: 'J10+K10' })
    expect(item1.getCell(1).fill).toMatchObject({ pattern: 'none' })
  })

  it('escreve os totais gerais na linha 6 como fórmula SUM(...)/2 cobrindo toda a faixa', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.getCell('J6').value).toMatchObject({ formula: 'SUM(J9:J11)/2' })
    expect(ws.getCell('L6').value).toMatchObject({ formula: 'SUM(L9:L11)/2' })
  })

  it('congela o painel em A9 e define o autofiltro até a última linha', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 8, topLeftCell: 'A9' })
    expect(ws.autoFilter).toMatchObject({ from: 'A8', to: 'N11' })
  })

  it('aplica a largura de coluna exata do template', () => {
    const wb = montarPlanilhaDescritivo(obra, grupos)
    const ws = wb.worksheets[0]
    expect(ws.getColumn(3).width).toBeCloseTo(72.3984375)
    expect(ws.getColumn(15).width).toBeCloseTo(0.5)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm run test:run -- lib/excel/export-template.test.ts`
Expected: FAIL — `export-template` não existe.

- [ ] **Step 3: Implementar `lib/excel/export-template.ts`**

```typescript
import ExcelJS from 'exceljs'

// Fidelidade visual ao template real da empresa (templates/orcamento-*.xlsx,
// inspecionados célula a célula em 2026-07-09). Ver Trilha D no plano
// docs/superpowers/plans/2026-07-09-clientes-obrigatorio-filtro-export.md
// para o mapeamento completo linha/coluna → campo.

const FONT_BASE = { name: 'Calibri', family: 2, size: 9, color: { theme: 1 } } as const
const FONT_BOLD = { ...FONT_BASE, bold: true } as const
const HAIR_SIDE = { style: 'hair' as const, color: { theme: 0, tint: -0.14996795556505021 } }
const HAIR_BORDER = { left: HAIR_SIDE, right: HAIR_SIDE, top: HAIR_SIDE, bottom: HAIR_SIDE }
const GROUP_FILL = {
  type: 'pattern' as const, pattern: 'solid' as const,
  fgColor: { theme: 0, tint: -0.1499984740745262 }, bgColor: { indexed: 64 },
}
const NO_FILL = { type: 'pattern' as const, pattern: 'none' as const }
const NUMFMT_MONEY = '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-'
const NUMFMT_QT = '0.00'
const ALIGN_TOP_LEFT = { horizontal: 'left' as const, vertical: 'top' as const }
const ALIGN_WRAP = { ...ALIGN_TOP_LEFT, wrapText: true }
const MONEY_COLS = [8, 9, 10, 11, 12]
const COLUMN_WIDTHS = [
  5.796875, 4.3984375, 72.3984375, 11.59765625, 13.59765625, 5.09765625, 4.796875,
  9.19921875, 10, 9.19921875, 10, 8.09765625, 11.59765625, 30.69921875, 0.5,
]

export interface ObraCabecalho {
  codigo: string
  nome: string
  cliente: { razao_social: string; endereco: string | null; cnpj: string | null } | null
}

export interface ItemDescritivo {
  numero: number
  descricao: string
  local: string | null
  unidade_sigla: string
  quantidade: number
  custo_unit_mao_obra: number
  custo_unit_material: number
  observacao: string | null
  observacao_2: string | null
}

export interface GrupoComItens {
  letra: string
  ordem: number
  disciplina_nome: string
  itens: ItemDescritivo[]
}

function estilizarLinha(row: ExcelJS.Row, opts: { bold: boolean; fill: typeof GROUP_FILL | typeof NO_FILL; qtCol?: number }) {
  for (let c = 1; c <= 14; c++) {
    const cell = row.getCell(c)
    cell.font = opts.bold ? FONT_BOLD : FONT_BASE
    cell.fill = opts.fill
    cell.border = HAIR_BORDER
    cell.alignment = c === 3 ? ALIGN_WRAP : ALIGN_TOP_LEFT
    if (MONEY_COLS.includes(c)) cell.numFmt = NUMFMT_MONEY
    if (opts.qtCol === c) cell.numFmt = NUMFMT_QT
  }
}

export function montarPlanilhaDescritivo(obra: ObraCabecalho, grupos: GrupoComItens[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistema de Orçamentos'
  const ws = wb.addWorksheet('.')

  ws.columns = COLUMN_WIDTHS.map(width => ({ width }))
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8, topLeftCell: 'A9', showGridLines: false }]

  ws.getCell('C1').value = 'DESCRITIVO TÉCNICO E COMERCIAL'
  ws.getCell('L1').value = { formula: 'TODAY()' }
  ws.getCell('L1').numFmt = 'mm-dd-yy'
  ws.getCell('C2').value = obra.cliente?.razao_social ?? ''
  ws.getCell('C3').value = `ENDEREÇO:  ${obra.cliente?.endereco ?? ''}`
  ws.getCell('C4').value = `CNPJ: ${obra.cliente?.cnpj ?? ''}`
  ws.getCell('C5').value = `${obra.codigo} ${obra.nome}`
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 15; c++) {
      const cell = ws.getRow(r).getCell(c)
      cell.font = FONT_BOLD
      cell.alignment = c === 3 ? ALIGN_WRAP : ALIGN_TOP_LEFT
    }
  }

  ws.mergeCells('H7:I7')
  ws.mergeCells('J7:K7')
  ws.getCell('H7').value = 'PREÇOS UNITÁRIOS'
  ws.getCell('J7').value = 'SUB TOTAL'
  ws.getCell('L7').value = 'TOTAL'

  const HEADERS = ['ITEM', 'Nº', 'DESCRIÇÃO', 'DISCIPLINA', 'LOCAL', 'UN.', 'QT.', 'M. OBRA', 'MATERIAL', 'M. OBRA', 'MATERIAL', 'TOTAL', 'OBS.', 'OBS.']
  HEADERS.forEach((h, i) => { ws.getCell(8, i + 1).value = h })

  estilizarLinha(ws.getRow(7), { bold: true, fill: NO_FILL })
  estilizarLinha(ws.getRow(8), { bold: true, fill: NO_FILL })

  let r = 9
  const primeiraLinha = r
  for (const grupo of grupos) {
    const grupoRow = r
    const primeiroItem = r + 1
    const ultimoItem = r + grupo.itens.length
    ws.getCell(r, 1).value = grupo.letra
    ws.getCell(r, 2).value = grupo.letra
    ws.getCell(r, 3).value = grupo.disciplina_nome.toUpperCase()
    ws.getCell(r, 4).value = '-'
    ws.getCell(r, 5).value = '-'
    ws.getCell(r, 6).value = '-'
    ws.getCell(r, 7).value = '-'
    ws.getCell(r, 8).value = '-'
    ws.getCell(r, 9).value = '-'
    ws.getCell(r, 10).value = { formula: `SUM(J${primeiroItem}:J${ultimoItem})` }
    ws.getCell(r, 11).value = { formula: `SUM(K${primeiroItem}:K${ultimoItem})` }
    ws.getCell(r, 12).value = { formula: `SUM(L${primeiroItem}:L${ultimoItem})` }
    estilizarLinha(ws.getRow(grupoRow), { bold: true, fill: GROUP_FILL })
    r++

    for (const item of grupo.itens) {
      ws.getCell(r, 1).value = grupo.letra
      ws.getCell(r, 2).value = item.numero
      ws.getCell(r, 3).value = item.descricao
      ws.getCell(r, 4).value = grupo.disciplina_nome
      ws.getCell(r, 5).value = item.local ?? ''
      ws.getCell(r, 6).value = item.unidade_sigla
      ws.getCell(r, 7).value = item.quantidade
      ws.getCell(r, 8).value = item.custo_unit_mao_obra
      ws.getCell(r, 9).value = item.custo_unit_material
      ws.getCell(r, 10).value = { formula: `H${r}*G${r}` }
      ws.getCell(r, 11).value = { formula: `I${r}*G${r}` }
      ws.getCell(r, 12).value = { formula: `J${r}+K${r}` }
      ws.getCell(r, 13).value = item.observacao ?? ''
      ws.getCell(r, 14).value = item.observacao_2 ?? ''
      estilizarLinha(ws.getRow(r), { bold: false, fill: NO_FILL, qtCol: 7 })
      r++
    }
  }
  const ultimaLinha = r - 1

  ws.getCell('J6').value = { formula: `SUM(J${primeiraLinha}:J${ultimaLinha})/2` }
  ws.getCell('K6').value = { formula: `SUM(K${primeiraLinha}:K${ultimaLinha})/2` }
  ws.getCell('L6').value = { formula: `SUM(L${primeiraLinha}:L${ultimaLinha})/2` }
  estilizarLinha(ws.getRow(6), { bold: true, fill: NO_FILL })

  ws.autoFilter = { from: 'A8', to: `N${ultimaLinha}` }

  return wb
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm run test:run -- lib/excel/export-template.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/excel/export-template.ts lib/excel/export-template.test.ts
git commit -m "feat: gerador de planilha fiel ao template real da empresa"
```

---

### Task 7 (Trilha D): Ligar o gerador na rota de export

**Files:**
- Modify: `app/api/obras/[id]/export/route.ts`

**Interfaces:**
- Consumes: `montarPlanilhaDescritivo(obra, grupos)` de Task 6.

- [ ] **Step 1: Substituir a construção manual do workbook pelo gerador fiel**

O handler `GET` mantém a mesma query Supabase e os mesmos parâmetros (`tipo=comercial|tecnico`), mas troca a construção do `ExcelJS.Workbook` (todo o bloco atual de `wb.addWorksheet(...)` em diante) por uma chamada a `montarPlanilhaDescritivo`. Como os dois templates são idênticos hoje (ver achados acima), os dois `tipo` usam o mesmo gerador — não há mais bifurcação `if (tipo === 'tecnico') { ... } else { ... }` com layouts diferentes.

Substituir todo o conteúdo de `app/api/obras/[id]/export/route.ts` por:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { montarPlanilhaDescritivo, type GrupoComItens } from '@/lib/excel/export-template'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const tipo = request.nextUrl.searchParams.get('tipo') === 'tecnico' ? 'tecnico' : 'comercial'

  const { data: obra, error } = await supabase
    .from('obras')
    .select(`
      codigo, nome,
      clientes (razao_social, endereco, cnpj),
      grupos_orcamento (
        letra, ordem,
        disciplinas (nome),
        itens_orcamento (
          numero, descricao, local, ordem,
          quantidade, custo_unit_mao_obra, custo_unit_material,
          observacao, observacao_2,
          unidades_medida (sigla)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !obra) {
    return NextResponse.json({ error: 'Obra não encontrada' }, { status: 404 })
  }

  const cliente = obra.clientes as unknown as { razao_social: string; endereco: string | null; cnpj: string | null } | null

  const grupos: GrupoComItens[] = (obra.grupos_orcamento ?? [])
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map(g => ({
      letra: g.letra,
      ordem: g.ordem,
      disciplina_nome: (g.disciplinas as unknown as { nome: string } | null)?.nome ?? '—',
      itens: (g.itens_orcamento ?? [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map(item => ({
          numero: item.numero,
          descricao: item.descricao,
          local: item.local,
          unidade_sigla: (item.unidades_medida as unknown as { sigla: string } | null)?.sigla ?? '',
          quantidade: Number(item.quantidade),
          custo_unit_mao_obra: Number(item.custo_unit_mao_obra),
          custo_unit_material: Number(item.custo_unit_material),
          observacao: item.observacao,
          observacao_2: item.observacao_2,
        })),
    }))

  const wb = montarPlanilhaDescritivo(
    { codigo: obra.codigo, nome: obra.nome, cliente },
    grupos
  )

  const buffer = await wb.xlsx.writeBuffer()
  const nomeArquivo = `orcamento-${tipo}-${obra.codigo.replace(/\s+/g, '-')}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    },
  })
}
```

Nota: `calcularItem`/`calcularGrupo`/`calcularRentabilidade` (de `lib/calculos.ts`) não são mais chamados aqui porque o template real não tem colunas de FEE/markup/venda — só custo bruto (M. OBRA/MATERIAL) e subtotal/total calculados por fórmula viva no próprio Excel. Isso está de acordo com "Nenhuma fórmula duplicada": a única fórmula (`H*G`, `I*G`, `J+K`, `SUM`) vive dentro da planilha gerada, não em JS.

- [ ] **Step 2: Verificação manual**

Não há teste automatizado para rotas de API neste projeto (padrão já estabelecido). Ler o arquivo modificado com atenção para confirmar: a query Supabase busca `observacao`/`observacao_2` (novos campos usados por Task 6, ausentes na query antiga); `grupos`/`itens` são ordenados por `ordem` antes de passar para `montarPlanilhaDescritivo`; o nome do arquivo baixado continua `orcamento-{tipo}-{codigo}.xlsx`. Se possível, rodar `npm run dev` e baixar o Excel de uma obra real para abrir no Excel/LibreOffice e comparar visualmente com `templates/orcamento-tecnico.xlsx`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/obras/[id]/export/route.ts"
git commit -m "feat: usar gerador fiel ao template na rota de export"
```

---

## Distribuição entre subagentes

| Trilha | Tasks | Arquivos tocados | Depende de | Pode rodar em paralelo com |
|---|---|---|---|---|
| A — Cliente obrigatório | 1 → 2 → 3 (sequencial) | migrations, `app/api/obras/*`, `app/(app)/obras/page.tsx`, `CabecalhoObra.tsx` | nada | B, C |
| B — Filtro dashboard | 4 | `app/(app)/dashboard/page.tsx`, `HeaderDashboard.tsx` | nada | A, C |
| C — round2 | 5 | `lib/format.ts` | nada | A, B |
| D — Export template | 6 → 7 (sequencial) | `templates/*`, `lib/excel/export-template.ts`, `app/api/obras/[id]/export/route.ts` | Templates recebidos (2026-07-09) + Task 5 concluída | — |

Nenhum arquivo é compartilhado entre A, B e C — as três trilhas podem ser despachadas para subagentes em paralelo sem conflito de merge. D fica em espera.

---

## Self-Review

**Cobertura da spec:**
- Feature 1 (Clientes) → Trilha A. ✅
- Feature 2 (Filtro dashboard) → Trilha B. ✅
- Feature 3 (Export fiel ao template) → Trilha D (bloqueada por dependência externa, não por omissão). ✅
- Feature 4 (Integridade de dados) → Trilha C (arredondamento) agora + aplicação em D quando desbloqueada. ✅

**Placeholders:** nenhum "TBD"/"implementar depois" fora do bloqueio explícito e documentado da Trilha D, que depende de arquivo externo ainda não recebido — não é uma lacuna de planejamento, é uma dependência real declarada.

**Consistência de tipos:** `round2(n: number): number` (Task 5) é o único símbolo novo reutilizado por outra trilha (D, quando desbloqueada) — nome e assinatura fixados aqui.
