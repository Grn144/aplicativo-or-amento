# Banco de Composições — Fase B5a (Alertas + Ordenação, sem IA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alertar composições incompletas (só material ou só mão de obra), alertar itens de orçamento cuja composição de origem já tem uma versão mais nova, e permitir ordenar a biblioteca por "mais utilizadas" — tudo sem LLM, reaproveitando dados de B1/B2.

**Architecture:** Uma função pura nova (`composicaoIncompleta`) em `lib/composicoes/calculos.ts`, reaproveitada tanto pela rota de listagem (servidor) quanto pelo modal (cliente). O alerta de "desatualizado" é um comparador local dentro de `TabelaOrcamento.tsx` (usado só ali, em duas visões do mesmo arquivo — não precisa ir para `lib/`). A rota de listagem de composições ganha ordenação em memória por `total_usos` (já calculado desde a B2) e uma contagem de materiais/mão-de-obra por composição para marcar `incompleta`, seguindo o mesmo padrão "query separada + merge" já usado para favoritos e usos.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Supabase (Postgres), Tailwind + shadcn/ui, lucide-react (ícones), Vitest.

## Global Constraints

- Nenhuma feature desta fase depende de LLM, embeddings, ou qualquer provedor de IA — se qualquer task parecer precisar disso, pare e escale, não é o escopo da B5a.
- "Incompleta" = tem materiais XOR tem mão de obra (nunca os dois vazios — já bloqueado ao salvar desde a B1). Nunca "sem produtividade" ou qualquer outra checagem.
- "Desatualizado" = comparação simples de número de versão (`item.composicao_versao < composicao.versao atual`) — **nunca** compara custos nem snapshots. Um item sem `composicao_id` nunca é considerado desatualizado nem incompleto.
- Nenhuma destas features altera cálculo de custo, venda, FEE, markup ou totais do orçamento — são puramente informativas/visuais.
- Ordenação por "mais utilizadas" acontece em memória (depois do merge com `composicao_usos`), nunca via `.order()` do Supabase — `total_usos` não é uma coluna do banco.

---

### Task 1: Tipos TypeScript

**Files:**
- Modify: `types/database.ts`

**Interfaces:**
- Produces: `ItemOrcamento` ganha `composicoes?: Pick<Composicao, 'versao'> | null`; `Composicao` ganha `incompleta?: boolean`. Usados pelas Tasks 3, 4, 5, 6, 7.

- [ ] **Step 1: Adicionar `composicoes` à interface `ItemOrcamento`**

Em `types/database.ts`, na interface `ItemOrcamento`, adicione o campo logo após `composicao_versao: number | null`:

```typescript
export interface ItemOrcamento {
  id: string
  grupo_id: string
  numero: number
  descricao: string
  local: string | null
  unidade_id: string | null
  quantidade: number
  custo_unit_mao_obra: number
  custo_unit_material: number
  markup_mao_obra: number
  markup_material: number
  fee_mao_obra: number | null
  fee_material: number | null
  observacao: string | null
  observacao_2: string | null
  ordem: number
  composicao_id: string | null
  composicao_versao: number | null
  composicoes?: Pick<Composicao, 'versao'> | null
  unidades_medida?: UnidadeMedida
}
```

- [ ] **Step 2: Adicionar `incompleta` à interface `Composicao`**

Na interface `Composicao`, adicione o campo logo após `ultimo_uso?: string | null`:

```typescript
export interface Composicao {
  id: string
  codigo: string
  nome: string
  disciplina_id: string | null
  descricao_tecnica: string
  unidade_id: string | null
  produtividade: string | null
  custo_direto: number
  markup_sugerido: number
  observacoes: string | null
  tags: string[]
  versao: number
  ativo: boolean
  responsavel_id: string | null
  criado_em: string
  atualizado_em: string
  disciplinas?: Pick<Disciplina, 'id' | 'nome'> | null
  unidades_medida?: Pick<UnidadeMedida, 'id' | 'sigla'> | null
  favorito?: boolean
  total_usos?: number
  ultimo_uso?: string | null
  incompleta?: boolean
}
```

Note: `Composicao` está definida antes de `ItemOrcamento` no arquivo — Step 1 referencia `Pick<Composicao, 'versao'>`, então confirme que `Composicao` já existe acima de `ItemOrcamento` (deve estar, já que `ItemOrcamento` fica depois no arquivo desde a B1).

- [ ] **Step 3: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo (nenhum código ainda usa os campos novos, isso só confirma a sintaxe).

- [ ] **Step 4: Commit**

```bash
git add types/database.ts
git commit -m "feat: tipos para alerta de composicao desatualizada e incompleta"
```

---

### Task 2: `composicaoIncompleta` (lib/composicoes/calculos.ts)

**Files:**
- Modify: `lib/composicoes/calculos.ts`
- Modify: `lib/composicoes/calculos.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `composicaoIncompleta(temMateriais: boolean, temMaoObra: boolean): boolean` — usado pelas Tasks 5 e 7.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicione ao final de `lib/composicoes/calculos.test.ts` (mantendo os `describe` já existentes de `calcularCustoDireto`, `mapearComposicaoParaItem`, `composicaoMudou`):

```typescript
describe('composicaoIncompleta', () => {
  it('retorna false quando tem materiais e mão de obra', () => {
    expect(composicaoIncompleta(true, true)).toBe(false)
  })

  it('retorna true quando só tem materiais', () => {
    expect(composicaoIncompleta(true, false)).toBe(true)
  })

  it('retorna true quando só tem mão de obra', () => {
    expect(composicaoIncompleta(false, true)).toBe(true)
  })
})
```

E adicione `composicaoIncompleta` ao import já existente no topo do arquivo:

```typescript
import { calcularCustoDireto, mapearComposicaoParaItem, composicaoMudou, composicaoIncompleta } from './calculos'
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/composicoes/calculos.test.ts`
Expected: FAIL — `composicaoIncompleta` não existe em `./calculos` (os testes já existentes de `calcularCustoDireto`/`mapearComposicaoParaItem`/`composicaoMudou` continuam passando).

- [ ] **Step 3: Implementar**

Adicione ao final de `lib/composicoes/calculos.ts`:

```typescript
/** Uma composição é "incompleta" quando tem materiais mas nenhuma mão de
 * obra, ou mão de obra mas nenhum material — nunca os dois vazios (isso já
 * é bloqueado ao salvar a composição desde a B1). */
export function composicaoIncompleta(temMateriais: boolean, temMaoObra: boolean): boolean {
  return temMateriais !== temMaoObra
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/composicoes/calculos.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 3 novos)

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm run test:run`
Expected: todos os testes passam (103 já existentes + 3 novos = 106), output limpo.

- [ ] **Step 6: Commit**

```bash
git add lib/composicoes/calculos.ts lib/composicoes/calculos.test.ts
git commit -m "feat: composicaoIncompleta para alerta de composicao incompleta"
```

---

### Task 3: Servidor — trazer versão atual da composição junto com cada item do orçamento

**Files:**
- Modify: `app/(app)/obras/[id]/page.tsx`

**Interfaces:**
- Consumes: tabela `composicoes` (coluna `versao`, já existente desde a B1).
- Produces: cada item em `obra.grupos_orcamento[].itens_orcamento[]` passa a trazer `composicao_id`, `composicao_versao` e `composicoes: { versao }` — consumido pela Task 4.

**Contexto:** esta página já busca a obra inteira com todos os grupos/itens, mas o `select` atual **não** traz `composicao_id`/`composicao_versao`/nenhum dado da composição — só o resto dos campos do item. Esta task adiciona isso.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `app/(app)/obras/[id]/page.tsx` inteiro antes de editar.

- [ ] **Step 2: Adicionar os campos ao tipo inline `ObraCompleta`**

Localize o tipo `itens_orcamento` dentro de `ObraCompleta.grupos_orcamento`:

```typescript
    itens_orcamento: {
      id: string
      grupo_id: string
      numero: number
      descricao: string
      local: string | null
      unidade_id: string | null
      quantidade: number
      custo_unit_mao_obra: number
      custo_unit_material: number
      markup_mao_obra: number
      markup_material: number
      fee_mao_obra: number | null
      fee_material: number | null
      observacao: string | null
      observacao_2: string | null
      ordem: number
      unidades_medida: { id: string; sigla: string; descricao: string | null } | null
    }[]
```

Substitua por (adiciona os três campos novos, mantendo tudo o resto igual):

```typescript
    itens_orcamento: {
      id: string
      grupo_id: string
      numero: number
      descricao: string
      local: string | null
      unidade_id: string | null
      quantidade: number
      custo_unit_mao_obra: number
      custo_unit_material: number
      markup_mao_obra: number
      markup_material: number
      fee_mao_obra: number | null
      fee_material: number | null
      observacao: string | null
      observacao_2: string | null
      ordem: number
      composicao_id: string | null
      composicao_versao: number | null
      composicoes: { versao: number } | null
      unidades_medida: { id: string; sigla: string; descricao: string | null } | null
    }[]
```

- [ ] **Step 3: Adicionar as colunas ao `select` do Supabase**

Localize o bloco do `select`:

```typescript
          itens_orcamento (
            id, grupo_id, numero, descricao, local, unidade_id,
            quantidade, custo_unit_mao_obra, custo_unit_material,
            markup_mao_obra, markup_material,
            fee_mao_obra, fee_material,
            observacao, observacao_2, ordem,
            unidades_medida (id, sigla, descricao)
          )
```

Substitua por:

```typescript
          itens_orcamento (
            id, grupo_id, numero, descricao, local, unidade_id,
            quantidade, custo_unit_mao_obra, custo_unit_material,
            markup_mao_obra, markup_material,
            fee_mao_obra, fee_material,
            observacao, observacao_2, ordem,
            composicao_id, composicao_versao,
            composicoes (versao),
            unidades_medida (id, sigla, descricao)
          )
```

Não altere mais nada no arquivo — o resto da lógica (ordenação de grupos/itens, `notFound()`, passagem de props para `EditorOrcamento`) fica igual.

- [ ] **Step 4: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/obras/[id]/page.tsx"
git commit -m "feat: busca versao atual da composicao junto com cada item do orcamento"
```

---

### Task 4: UI — indicador de composição desatualizada em `TabelaOrcamento`

**Files:**
- Modify: `components/orcamento/TabelaOrcamento.tsx`

**Interfaces:**
- Consumes: `item.composicao_id`/`composicao_versao`/`composicoes` (Task 1 + 3).
- Produces: nenhuma interface nova — só UI.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/orcamento/TabelaOrcamento.tsx` inteiro antes de editar.

- [ ] **Step 2: Adicionar o import do ícone e a função auxiliar**

No topo do arquivo, troque:

```typescript
import { Fragment, useRef, useState } from 'react'
import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import type { Disciplina, UnidadeMedida } from '@/types/database'
```

Por:

```typescript
import { Fragment, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { fmt, fmtPct } from '@/lib/format'
import type { GrupoCalculado, TotaisGerais, TipoVisao } from '@/types/orcamento'
import type { Disciplina, UnidadeMedida } from '@/types/database'
```

Logo após a declaração de `CelulaEditavel` (depois do `}` que a fecha, antes de `export default function TabelaOrcamento`), adicione a função auxiliar:

```typescript
function itemDesatualizado(item: {
  composicao_id: string | null
  composicao_versao: number | null
  composicoes?: { versao: number } | null
}): boolean {
  return (
    !!item.composicao_id &&
    item.composicao_versao != null &&
    item.composicoes != null &&
    item.composicao_versao < item.composicoes.versao
  )
}

function IndicadorDesatualizado({ item }: { item: Parameters<typeof itemDesatualizado>[0] }) {
  if (!itemDesatualizado(item)) return null
  return (
    <span
      title={`Composição atualizada disponível (v${item.composicoes?.versao}) — este item usa a v${item.composicao_versao}`}
      className="shrink-0 text-amber-500"
    >
      <AlertTriangle className="size-3.5" />
    </span>
  )
}
```

- [ ] **Step 3: Adicionar o indicador na visão comercial**

Localize a célula de descrição na visão comercial (dentro de `grupo.itens_calculados.map(item => (...))`, na primeira tabela do arquivo):

```typescript
                      <td className="px-2 py-1">
                        <CelulaEditavel
                          valor={item.descricao}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                        />
                      </td>
```

Substitua por:

```typescript
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <CelulaEditavel
                            valor={item.descricao}
                            tipo="text"
                            onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                          />
                          <IndicadorDesatualizado item={item} />
                        </div>
                      </td>
```

- [ ] **Step 4: Adicionar o indicador na visão técnica**

Localize a célula de descrição equivalente na visão técnica (segunda tabela do arquivo, mesma estrutura de `CelulaEditavel` para `descricao`):

```typescript
                    <td className="px-2 py-1">
                      <CelulaEditavel
                        valor={item.descricao}
                        tipo="text"
                        onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                      />
                    </td>
```

Substitua por:

```typescript
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <CelulaEditavel
                          valor={item.descricao}
                          tipo="text"
                          onSave={v => onUpdateItem(grupo.id, item.id, 'descricao', v)}
                        />
                        <IndicadorDesatualizado item={item} />
                      </div>
                    </td>
```

(As duas ocorrências têm indentação levemente diferente — 22 vs 20 espaços — porque uma está dentro da visão comercial e outra da técnica. Aplique cada edit na tabela correspondente, não troque as duas de uma vez com find-replace global.)

- [ ] **Step 5: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo. `ItemCalculado` (usado por `grupo.itens_calculados`) estende `ItemOrcamento`, que já ganhou `composicoes`/`composicao_id`/`composicao_versao` na Task 1 — o tipo deve casar sem cast adicional.

- [ ] **Step 6: Commit**

```bash
git add components/orcamento/TabelaOrcamento.tsx
git commit -m "feat: indicador de composicao desatualizada por item no orcamento"
```

---

### Task 5: API — `incompleta` e ordenação por usos na listagem

**Files:**
- Modify: `app/api/composicoes/route.ts`

**Interfaces:**
- Consumes: `composicaoIncompleta` (Task 2), tabelas `composicao_materiais`/`composicao_mao_obra` (já existentes).
- Produces: `GET /api/composicoes` aceita `?ordenar=usos` e cada item ganha `incompleta: boolean` — consumido pela Task 6.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `app/api/composicoes/route.ts` inteiro antes de editar — a Task não deve tocar no handler `POST`.

- [ ] **Step 2: Adicionar o import de `composicaoIncompleta`**

Troque:

```typescript
import { calcularCustoDireto } from '@/lib/composicoes/calculos'
```

Por:

```typescript
import { calcularCustoDireto, composicaoIncompleta } from '@/lib/composicoes/calculos'
```

- [ ] **Step 3: Ler o parâmetro `ordenar`**

Localize:

```typescript
  const somenteFavoritos = searchParams.get('favoritos') === 'true'
```

Adicione logo abaixo:

```typescript
  const ordenar = searchParams.get('ordenar') ?? ''
```

- [ ] **Step 4: Buscar contagem de materiais/mão de obra e computar `incompleta`, e ordenar por usos quando pedido**

Localize o final do handler `GET`:

```typescript
  const usosPorComposicao = new Map<string, { total: number; ultimo: string }>()
  for (const uso of usos ?? []) {
    const atual = usosPorComposicao.get(uso.composicao_id)
    if (!atual) {
      usosPorComposicao.set(uso.composicao_id, { total: 1, ultimo: uso.criado_em })
    } else {
      atual.total += 1
      if (uso.criado_em > atual.ultimo) atual.ultimo = uso.criado_em
    }
  }

  const comFavoritoEUsos = (data ?? []).map(c => ({
    ...c,
    favorito: idsFavoritos.has(c.id),
    total_usos: usosPorComposicao.get(c.id)?.total ?? 0,
    ultimo_uso: usosPorComposicao.get(c.id)?.ultimo ?? null,
  }))
  return NextResponse.json(comFavoritoEUsos)
}
```

Substitua por:

```typescript
  const usosPorComposicao = new Map<string, { total: number; ultimo: string }>()
  for (const uso of usos ?? []) {
    const atual = usosPorComposicao.get(uso.composicao_id)
    if (!atual) {
      usosPorComposicao.set(uso.composicao_id, { total: 1, ultimo: uso.criado_em })
    } else {
      atual.total += 1
      if (uso.criado_em > atual.ultimo) atual.ultimo = uso.criado_em
    }
  }

  const { data: materiaisContagem, error: erroMateriais } = idsResultado.length > 0
    ? await supabase.from('composicao_materiais').select('composicao_id').in('composicao_id', idsResultado)
    : { data: [], error: null }
  if (erroMateriais) return NextResponse.json({ error: erroMateriais.message }, { status: 500 })
  const { data: maoObraContagem, error: erroMaoObra } = idsResultado.length > 0
    ? await supabase.from('composicao_mao_obra').select('composicao_id').in('composicao_id', idsResultado)
    : { data: [], error: null }
  if (erroMaoObra) return NextResponse.json({ error: erroMaoObra.message }, { status: 500 })

  const idsComMateriais = new Set((materiaisContagem ?? []).map(m => m.composicao_id))
  const idsComMaoObra = new Set((maoObraContagem ?? []).map(m => m.composicao_id))

  let comFavoritoEUsos = (data ?? []).map(c => ({
    ...c,
    favorito: idsFavoritos.has(c.id),
    total_usos: usosPorComposicao.get(c.id)?.total ?? 0,
    ultimo_uso: usosPorComposicao.get(c.id)?.ultimo ?? null,
    incompleta: composicaoIncompleta(idsComMateriais.has(c.id), idsComMaoObra.has(c.id)),
  }))

  if (ordenar === 'usos') {
    comFavoritoEUsos = [...comFavoritoEUsos].sort((a, b) => b.total_usos - a.total_usos)
  }

  return NextResponse.json(comFavoritoEUsos)
}
```

Não altere o handler `POST` neste arquivo.

- [ ] **Step 5: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

- [ ] **Step 6: Commit**

```bash
git add app/api/composicoes/route.ts
git commit -m "feat: expoe incompleta e ordenacao por usos na listagem de composicoes"
```

---

### Task 6: UI — ordenar por usos e ícone de incompleta na biblioteca

**Files:**
- Modify: `components/composicoes/ComposicoesPageClient.tsx`

**Interfaces:**
- Consumes: `?ordenar=usos` e `incompleta` (Task 5).
- Produces: nenhuma interface nova — só UI.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/composicoes/ComposicoesPageClient.tsx` inteiro antes de editar.

- [ ] **Step 2: Adicionar o import do ícone e o estado de ordenação**

Troque:

```typescript
import { Pencil, Trash2, Star } from 'lucide-react'
```

Por:

```typescript
import { Pencil, Trash2, Star, AlertTriangle } from 'lucide-react'
```

Logo após `const [somenteFavoritos, setSomenteFavoritos] = useState(false)`, adicione:

```typescript
  const [ordenar, setOrdenar] = useState('')
```

- [ ] **Step 3: Incluir `ordenar` na busca**

Troque:

```typescript
  const carregar = useCallback(async () => {
    setCarregando(true)
    const params = new URLSearchParams()
    if (busca.trim()) params.set('busca', busca.trim())
    if (disciplinaId) params.set('disciplina_id', disciplinaId)
    if (somenteFavoritos) params.set('favoritos', 'true')
    const res = await fetch(`/api/composicoes?${params.toString()}`)
    const data = await res.json()
    setComposicoes(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [busca, disciplinaId, somenteFavoritos])
```

Por:

```typescript
  const carregar = useCallback(async () => {
    setCarregando(true)
    const params = new URLSearchParams()
    if (busca.trim()) params.set('busca', busca.trim())
    if (disciplinaId) params.set('disciplina_id', disciplinaId)
    if (somenteFavoritos) params.set('favoritos', 'true')
    if (ordenar) params.set('ordenar', ordenar)
    const res = await fetch(`/api/composicoes?${params.toString()}`)
    const data = await res.json()
    setComposicoes(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [busca, disciplinaId, somenteFavoritos, ordenar])
```

- [ ] **Step 4: Adicionar o controle "Ordenar por"**

Localize:

```typescript
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={somenteFavoritos} onChange={e => setSomenteFavoritos(e.target.checked)} />
          Só favoritos
        </label>
      </div>
```

Substitua por:

```typescript
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={somenteFavoritos} onChange={e => setSomenteFavoritos(e.target.checked)} />
          Só favoritos
        </label>
        <NativeSelect value={ordenar} onChange={e => setOrdenar(e.target.value)} className="max-w-[180px]">
          <option value="">Ordenar por nome</option>
          <option value="usos">Mais utilizadas</option>
        </NativeSelect>
      </div>
```

- [ ] **Step 5: Adicionar o ícone de incompleta na célula de nome**

Localize:

```typescript
                  <td className="px-4 py-3 font-medium">{c.nome}</td>
```

Substitua por:

```typescript
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      {c.nome}
                      {c.incompleta && (
                        <span title="Composição incompleta — só tem material ou só mão de obra" className="shrink-0 text-amber-500">
                          <AlertTriangle className="size-3.5" />
                        </span>
                      )}
                    </div>
                  </td>
```

- [ ] **Step 6: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

- [ ] **Step 7: Commit**

```bash
git add components/composicoes/ComposicoesPageClient.tsx
git commit -m "feat: ordenar biblioteca por usos e sinalizar composicao incompleta"
```

---

### Task 7: UI — aviso de composição incompleta no `ComposicaoModal`

**Files:**
- Modify: `components/composicoes/ComposicaoModal.tsx`

**Interfaces:**
- Consumes: `composicaoIncompleta` (Task 2).
- Produces: nenhuma interface nova — só UI.

- [ ] **Step 1: Ler o arquivo atual por completo**

Leia `components/composicoes/ComposicaoModal.tsx` inteiro antes de editar.

- [ ] **Step 2: Adicionar os imports**

Troque:

```typescript
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
```

Por:

```typescript
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
```

Troque:

```typescript
import { calcularCustoDireto } from '@/lib/composicoes/calculos'
```

Por:

```typescript
import { calcularCustoDireto, composicaoIncompleta } from '@/lib/composicoes/calculos'
```

- [ ] **Step 3: Computar `incompleta`**

Localize:

```typescript
  const custoDiretoPreview = calcularCustoDireto(
    materiais.map(m => ({ quantidade: Number(m.quantidade) || 0, preco_unitario: Number(m.preco_unitario) || 0 })),
    maoDeObra.map(m => ({ horas: Number(m.horas) || 0, custo_hora: Number(m.custo_hora) || 0 }))
  )
```

Adicione logo abaixo:

```typescript
  const incompleta = composicaoIncompleta(materiais.length > 0, maoDeObra.length > 0)
```

- [ ] **Step 4: Mostrar o aviso**

Localize:

```typescript
            <p className="text-sm font-medium">
              Custo direto (por 1 unidade): {custoDiretoPreview.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
```

Substitua por:

```typescript
            <p className="text-sm font-medium">
              Custo direto (por 1 unidade): {custoDiretoPreview.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>

            {incompleta && (
              <p className="flex items-center gap-1.5 text-sm text-amber-600">
                <AlertTriangle className="size-4 shrink-0" />
                Composição incompleta — tem só material ou só mão de obra.
              </p>
            )}
```

- [ ] **Step 5: Verificar que o projeto compila**

Run: `npx tsc --noEmit`
Expected: zero erros envolvendo este arquivo.

- [ ] **Step 6: Rodar a suíte completa e o typecheck geral**

Run: `npm run test:run`
Expected: todos os testes passam (106 no total: 103 já existentes + 3 novos da Task 2), output limpo.

Run: `npx tsc --noEmit`
Expected: nenhum erro novo em qualquer arquivo tocado neste plano.

- [ ] **Step 7: Commit**

```bash
git add components/composicoes/ComposicaoModal.tsx
git commit -m "feat: aviso de composicao incompleta no modal"
```

---

## Verificação manual final (fluxo ponta-a-ponta)

Depois de concluir todas as tasks:

1. Rodar `npm run dev`, logar como usuário `admin` ou `engenheiro`.
2. Em `/composicoes`, criar uma composição só com material (nenhuma mão de obra). Confirmar que ela aparece com o ícone de aviso na tabela e no modal.
3. Editar essa composição e adicionar um item de mão de obra — o aviso deve sumir tanto na tabela quanto no modal (recarregar se necessário).
4. Inserir uma composição num orçamento (fluxo já existente). Editar essa composição em `/composicoes` de forma que gere uma nova versão (ex: mudar o preço de um material). Voltar no orçamento e confirmar que o item mostra o ícone de "composição desatualizada", com tooltip indicando as versões.
5. Inserir um item manualmente (sem composição) e confirmar que ele nunca mostra nenhum dos dois ícones.
6. Em `/composicoes`, trocar "Ordenar por" para "Mais utilizadas" e confirmar que a composição mais usada aparece primeiro. Voltar para "Ordenar por nome" e confirmar que volta à ordem alfabética.
7. Confirmar que nenhum valor de custo, venda, FEE, markup ou totais do orçamento mudou em relação ao comportamento anterior a este plano.
